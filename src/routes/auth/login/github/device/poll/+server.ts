import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { upsertGitHubUser, createSession, sessionCookieOptions } from '$lib/server/auth';
import { pollDeviceFlow, cancelDeviceFlow } from '$lib/server/github-device';
import { checkRate } from '$lib/server/rate-limit';

/**
 * Poll a pending device-flow login. The flow id comes from the httpOnly
 * cookie set by the start endpoint, so only the initiating browser can
 * redeem the grant. On success this mirrors the web-flow callback:
 * fetch the GitHub user, upsert, and set the session cookie.
 */
export const POST: RequestHandler = async ({ cookies, getClientAddress }) => {
	// Generous cap — polls arrive every ~5s; this only stops abuse.
	if (!checkRate(`devpoll:${getClientAddress()}`, 30, 60_000)) {
		return json({ status: 'pending' });
	}

	const flowId = cookies.get('github_device_flow');
	if (!flowId) return json({ status: 'expired' });

	const result = await pollDeviceFlow(flowId);
	if (result.status !== 'ok') {
		if (result.status !== 'pending') cookies.delete('github_device_flow', { path: '/' });
		return json(result);
	}

	const res = await fetch('https://api.github.com/user', {
		headers: { Authorization: `Bearer ${result.accessToken}` }
	});
	if (!res.ok) {
		cancelDeviceFlow(flowId);
		cookies.delete('github_device_flow', { path: '/' });
		return json({ status: 'error', message: 'Failed to fetch GitHub user profile.' });
	}
	const githubUser = await res.json();
	const user = upsertGitHubUser({
		id: githubUser.id,
		login: githubUser.login,
		name: githubUser.name,
		email: githubUser.email,
		avatar_url: githubUser.avatar_url
	});

	cookies.delete('github_device_flow', { path: '/' });
	const sessionId = createSession(user.id);
	cookies.set('session', sessionId, sessionCookieOptions());
	return json({ status: 'ok' });
};
