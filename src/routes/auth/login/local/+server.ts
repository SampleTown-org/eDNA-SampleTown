import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyLocalUser, createLocalUser, createSession, sessionCookieOptions } from '$lib/server/auth';
import { getDb } from '$lib/server/db';
import { env } from '$env/dynamic/private';
import { checkRate } from '$lib/server/rate-limit';
import { timingSafeEqual } from 'node:crypto';

function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	if (ab.length !== bb.length) return false;
	return timingSafeEqual(ab, bb);
}

const MIN_PASSWORD_LEN = 10;
const MAX_PASSWORD_LEN = 128;

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	// Rate limit per IP: 5 attempts / minute
	const ip = getClientAddress();
	if (!checkRate(`login:${ip}`, 5, 60_000)) {
		throw redirect(302, '/auth/login?error=rate_limited');
	}

	const formData = await request.formData();
	const username = formData.get('username')?.toString()?.trim();
	const password = formData.get('password')?.toString();

	if (!username || !password) {
		throw redirect(302, '/auth/login?error=missing_credentials');
	}
	if (password.length < MIN_PASSWORD_LEN || password.length > MAX_PASSWORD_LEN) {
		throw redirect(302, '/auth/login?error=invalid_credentials');
	}

	// Bootstrap path: create the first admin if (a) ADMIN_SETUP_TOKEN env var is
	// set, (b) the form provides a matching token, and (c) the users table is
	// empty. After the first user exists, the token is ignored entirely.
	const setupToken = formData.get('setup_token')?.toString() ?? '';
	const expectedToken = env.ADMIN_SETUP_TOKEN ?? '';
	const db = getDb();
	const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;

	let user = null;
	if (
		userCount === 0 &&
		expectedToken.length > 0 &&
		setupToken.length > 0 &&
		safeEqual(setupToken, expectedToken)
	) {
		user = await createLocalUser(username, password, 'admin');
	} else {
		user = await verifyLocalUser(username, password);
	}
	if (!user) {
		throw redirect(302, '/auth/login?error=invalid_credentials');
	}

	const sessionId = createSession(user.id);
	cookies.set('session', sessionId, sessionCookieOptions());

	throw redirect(302, '/');
};
