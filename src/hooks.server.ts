import type { Handle } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { validateSession, maybeSweepExpired } from '$lib/server/auth';

/**
 * Routes under /api/* that are reachable without authentication.
 * Anything not matched here requires a valid session for any HTTP method.
 *
 * KEEP THIS LIST SHORT. Adding routes here opens the public attack surface;
 * prefer wiring auth into the handler.
 */
const PUBLIC_API_ROUTES: Record<string, string[]> = {
	'/api/feedback': ['POST'] // anonymous lab users can submit feedback
};

function isPublicApi(pathname: string, method: string): boolean {
	const allowed = PUBLIC_API_ROUTES[pathname];
	return !!allowed && allowed.includes(method);
}

/**
 * Path prefixes whose mutating verbs require an admin role.
 * GET on these paths still works for any authenticated user (so the
 * Settings page can render dropdowns) — only writes are admin-gated.
 */
const ADMIN_WRITE_PREFIXES = [
	'/api/settings/',
	'/api/personnel', // covers /api/personnel and /api/personnel/[id]
	'/api/db/'
];

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function requiresAdmin(pathname: string, method: string): boolean {
	if (!MUTATING_METHODS.has(method)) {
		// GET /api/feedback is admin-only (list of all feedback)
		if (pathname === '/api/feedback' && method === 'GET') return true;
		return false;
	}
	return ADMIN_WRITE_PREFIXES.some((p) => pathname.startsWith(p));
}

export const handle: Handle = async ({ event, resolve }) => {
	// Initialize DB on first request
	getDb();

	// Periodic sweep of expired sessions + oauth states (rate-limited internally).
	maybeSweepExpired();

	// Session-based auth
	const sessionId = event.cookies.get('session');
	event.locals.user = sessionId ? validateSession(sessionId) : null;

	// Centralized API auth gate.
	const { pathname } = event.url;
	const method = event.request.method;
	if (pathname.startsWith('/api/')) {
		if (!event.locals.user && !isPublicApi(pathname, method)) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}
		if (requiresAdmin(pathname, method) && event.locals.user?.role !== 'admin') {
			return json({ error: 'Admin role required' }, { status: 403 });
		}
	}

	return resolve(event);
};
