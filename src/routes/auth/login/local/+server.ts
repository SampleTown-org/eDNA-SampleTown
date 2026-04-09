import { redirect, error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyLocalUser, createLocalUser, createSession, getAuthMode } from '$lib/server/auth';
import { getDb } from '$lib/server/db';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const formData = await request.formData();
	const username = formData.get('username')?.toString()?.trim();
	const password = formData.get('password')?.toString();

	if (!username || !password) {
		throw redirect(302, '/auth/login?error=missing_credentials');
	}

	// Auto-create first user as admin if no users exist
	const db = getDb();
	const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;

	let user;
	if (userCount === 0) {
		user = await createLocalUser(username, password, 'admin');
	} else {
		user = await verifyLocalUser(username, password);
	}

	if (!user) {
		throw redirect(302, '/auth/login?error=invalid_credentials');
	}

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
