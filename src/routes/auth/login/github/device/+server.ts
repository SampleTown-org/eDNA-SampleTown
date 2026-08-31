import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isSecureOrigin } from '$lib/server/auth';
import { isDeviceFlowAvailable, startDeviceFlow } from '$lib/server/github-device';
import { checkRate } from '$lib/server/rate-limit';

/**
 * Start a GitHub device-flow login. Returns the user code + verification
 * URI for the login page to display; the device_code stays server-side,
 * bound to this browser via the httpOnly flow cookie.
 */
export const POST: RequestHandler = async ({ cookies, getClientAddress }) => {
	if (!isDeviceFlowAvailable()) {
		return json({ error: 'GitHub device login is not configured.' }, { status: 404 });
	}
	// 5 new flows / minute / IP — same budget as password attempts.
	if (!checkRate(`devflow:${getClientAddress()}`, 5, 60_000)) {
		return json({ error: 'Too many attempts, please wait a minute.' }, { status: 429 });
	}

	try {
		const flow = await startDeviceFlow();
		cookies.set('github_device_flow', flow.flowId, {
			path: '/',
			httpOnly: true,
			secure: isSecureOrigin(),
			maxAge: flow.expiresIn,
			sameSite: 'lax'
		});
		return json({
			user_code: flow.userCode,
			verification_uri: flow.verificationUri,
			expires_in: flow.expiresIn,
			interval: flow.intervalSec
		});
	} catch (err) {
		return json(
			{ error: err instanceof Error ? err.message : 'Could not start GitHub device login.' },
			{ status: 502 }
		);
	}
};
