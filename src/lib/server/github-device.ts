import { randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { getAuthMode } from './auth';

/**
 * GitHub OAuth *device flow* — the portable login path for lab/ship
 * instances whose origin can't be pre-registered as an OAuth callback
 * (DHCP LAN IPs, offline-first boxes, per-lab installs).
 *
 * Unlike the web flow it needs only GITHUB_CLIENT_ID — no client secret,
 * no callback URL — so one shared OAuth App (with "Enable Device Flow"
 * ticked in its GitHub settings) serves every deployment. The server asks
 * GitHub for a short user code, the person enters it at
 * github.com/login/device from any browser with internet, and the server
 * polls GitHub until the grant completes.
 *
 * The device_code is the credential that redeems the access token, so it
 * never leaves the server: pending flows live in this in-memory map keyed
 * by an opaque flow id that is bound to the initiating browser via an
 * httpOnly cookie (same trust model as the web flow's state cookie). The
 * map is process-local — a restart drops pending logins, which just means
 * the user clicks the button again.
 */

export function getGitHubClientId(): string | null {
	return env.GITHUB_CLIENT_ID?.trim() || null;
}

/** Device flow is offered when GitHub auth is enabled and a client id
 *  exists. The web flow additionally needs the secret + registered
 *  callback — see getGitHub(); availability of the two is independent. */
export function isDeviceFlowAvailable(): boolean {
	return getAuthMode() !== 'local' && !!getGitHubClientId();
}

interface PendingFlow {
	deviceCode: string;
	/** Minimum seconds between polls to GitHub (they may raise it via slow_down). */
	intervalSec: number;
	expiresAt: number;
	lastGitHubPoll: number;
}

const FLOWS = new Map<string, PendingFlow>();

function sweepFlows() {
	const now = Date.now();
	for (const [id, f] of FLOWS) if (f.expiresAt < now) FLOWS.delete(id);
}

export interface DeviceStart {
	flowId: string;
	userCode: string;
	verificationUri: string;
	expiresIn: number;
	intervalSec: number;
}

/** Ask GitHub for a device + user code pair and register the pending flow. */
export async function startDeviceFlow(): Promise<DeviceStart> {
	const clientId = getGitHubClientId();
	if (!clientId) throw new Error('GITHUB_CLIENT_ID not configured');
	sweepFlows();

	const res = await fetch('https://github.com/login/device/code', {
		method: 'POST',
		headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
		body: JSON.stringify({ client_id: clientId, scope: 'user:email' })
	});
	const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
	if (!res.ok || !body?.device_code) {
		// GitHub returns 200 + {error} for app-level problems (e.g. device
		// flow not enabled on the OAuth App) — surface those too.
		const detail =
			(body?.error_description as string) ||
			(body?.error as string) ||
			`GitHub device/code returned ${res.status}`;
		throw new Error(detail);
	}

	const flowId = randomBytes(24).toString('base64url');
	const expiresIn = Number(body.expires_in) || 900;
	const intervalSec = Number(body.interval) || 5;
	FLOWS.set(flowId, {
		deviceCode: body.device_code as string,
		intervalSec,
		expiresAt: Date.now() + expiresIn * 1000,
		lastGitHubPoll: 0
	});
	return {
		flowId,
		userCode: body.user_code as string,
		verificationUri: (body.verification_uri as string) || 'https://github.com/login/device',
		expiresIn,
		intervalSec
	};
}

export type DevicePollResult =
	| { status: 'pending'; intervalSec: number }
	| { status: 'expired' }
	| { status: 'denied' }
	| { status: 'error'; message: string }
	| { status: 'ok'; accessToken: string };

/** One poll against GitHub's token endpoint for a pending flow. Enforces
 *  the polling interval server-side regardless of client behavior. */
export async function pollDeviceFlow(flowId: string): Promise<DevicePollResult> {
	const clientId = getGitHubClientId();
	const flow = FLOWS.get(flowId);
	if (!clientId || !flow) return { status: 'expired' };
	if (flow.expiresAt < Date.now()) {
		FLOWS.delete(flowId);
		return { status: 'expired' };
	}

	// Don't hit GitHub more often than the granted interval — an over-eager
	// client just gets 'pending' back without a network call.
	const since = (Date.now() - flow.lastGitHubPoll) / 1000;
	if (since < flow.intervalSec) return { status: 'pending', intervalSec: flow.intervalSec };
	flow.lastGitHubPoll = Date.now();

	const res = await fetch('https://github.com/login/oauth/access_token', {
		method: 'POST',
		headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
		body: JSON.stringify({
			client_id: clientId,
			device_code: flow.deviceCode,
			grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
		})
	});
	const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
	if (!body) return { status: 'error', message: `GitHub token endpoint returned ${res.status}` };

	if (typeof body.access_token === 'string') {
		FLOWS.delete(flowId);
		return { status: 'ok', accessToken: body.access_token };
	}
	switch (body.error) {
		case 'authorization_pending':
			return { status: 'pending', intervalSec: flow.intervalSec };
		case 'slow_down':
			flow.intervalSec = Number(body.interval) || flow.intervalSec + 5;
			return { status: 'pending', intervalSec: flow.intervalSec };
		case 'expired_token':
			FLOWS.delete(flowId);
			return { status: 'expired' };
		case 'access_denied':
			FLOWS.delete(flowId);
			return { status: 'denied' };
		default:
			FLOWS.delete(flowId);
			return {
				status: 'error',
				message: (body.error_description as string) || (body.error as string) || 'Unknown GitHub error'
			};
	}
}

export function cancelDeviceFlow(flowId: string) {
	FLOWS.delete(flowId);
}
