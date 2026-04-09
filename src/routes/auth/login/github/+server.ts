import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getGitHub } from '$lib/server/auth';
import { getDb } from '$lib/server/db';
import { generateState } from 'arctic';

export const GET: RequestHandler = async ({ cookies }) => {
	const github = getGitHub();
	if (!github) {
		throw redirect(302, '/auth/login?error=github_not_configured');
	}

	const state = generateState();
	const url = github.createAuthorizationURL(state, ['user:email']);

	// Store state in DB with expiry — more reliable than cookies over SSH tunnels
	const db = getDb();
	db.prepare(`
		INSERT INTO oauth_states (state, expires_at)
		VALUES (?, datetime('now', '+10 minutes'))
	`).run(state);

	// Also try cookie as fallback
	cookies.set('github_oauth_state', state, {
		path: '/',
		httpOnly: true,
		secure: false,
		maxAge: 600,
		sameSite: 'none'
	});

	throw redirect(302, url.toString());
};
