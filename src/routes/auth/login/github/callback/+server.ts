import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGitHub, upsertGitHubUser, createSession } from '$lib/server/auth';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const github = getGitHub();
	if (!github) throw error(500, 'GitHub OAuth not configured');

	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');

	if (!code || !state) {
		throw error(400, 'Missing OAuth code or state');
	}

	// Try cookie first, fall back to DB-stored state (cookie may be dropped over SSH tunnel)
	let storedState = cookies.get('github_oauth_state') ?? null;
	let stateFromDb = false;

	if (!storedState) {
		const db = getDb();
		const row = db.prepare(
			"SELECT state FROM oauth_states WHERE state = ? AND expires_at > datetime('now')"
		).get(state);
		if (row) {
			storedState = state;
			stateFromDb = true;
		}
	}

	if (state !== storedState) {
		throw error(400, `Invalid OAuth state`);
	}

	// Clean up state
	cookies.delete('github_oauth_state', { path: '/' });
	const db = getDb();
	db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);

	const tokens = await github.validateAuthorizationCode(code);
	const accessToken = tokens.accessToken();

	const res = await fetch('https://api.github.com/user', {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	if (!res.ok) throw error(500, 'Failed to fetch GitHub user');

	const githubUser = await res.json();
	const user = upsertGitHubUser({
		id: githubUser.id,
		login: githubUser.login,
		name: githubUser.name,
		email: githubUser.email,
		avatar_url: githubUser.avatar_url
	});

	const sessionId = createSession(user.id);
	cookies.set('session', sessionId, {
		path: '/',
		httpOnly: true,
		secure: false,
		maxAge: 90 * 24 * 60 * 60,
		sameSite: 'lax'
	});

	throw redirect(302, '/');
};
