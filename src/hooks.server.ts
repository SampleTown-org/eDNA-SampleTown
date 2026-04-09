import type { Handle } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { validateSession } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	// Initialize DB on first request
	getDb();

	// Session-based auth
	const sessionId = event.cookies.get('session');
	event.locals.user = sessionId ? validateSession(sessionId) : null;

	return resolve(event);
};
