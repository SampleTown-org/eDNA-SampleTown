import type { Handle } from '@sveltejs/kit';
import { json, redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { validateSession, maybeSweepExpired, isSecureOrigin } from '$lib/server/auth';

/**
 * Security headers applied to every non-asset response.
 *
 *   CSP: default-src 'self' blocks external script/style by default. Svelte's
 *     hydration code is emitted as separate <script src> tags so no inline
 *     scripts are needed; style-src allows inline because Svelte component
 *     styles compile to <style> blocks with hashed classnames. Leaflet tiles
 *     come from openstreetmap.org — add to img-src.
 *   HSTS: only when ORIGIN is https. 180-day window is a conservative start;
 *     bump once we're confident the cert chain won't break.
 *   Referrer-Policy: same-origin so third-party services we link out to
 *     (NCBI, GitHub) don't see the exact page path.
 *   X-Frame-Options: prevent the app from being embedded in another origin's
 *     iframe (clickjacking defense).
 *   X-Content-Type-Options: stop MIME sniffing globally; the photo routes
 *     also set this explicitly as defense in depth.
 *
 * CSP nonces would let us drop 'unsafe-inline' for styles, but SvelteKit
 * doesn't generate them out of the box. Accept the tradeoff for now.
 */
const CSP = [
	"default-src 'self'",
	"script-src 'self'",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: https://*.tile.openstreetmap.org https://avatars.githubusercontent.com",
	"font-src 'self' data:",
	"connect-src 'self'",
	"frame-ancestors 'none'",
	"base-uri 'self'",
	"form-action 'self'"
].join('; ');

function applySecurityHeaders(response: Response) {
	response.headers.set('Content-Security-Policy', CSP);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'same-origin');
	response.headers.set('Permissions-Policy', 'geolocation=(self), camera=(self)');
	if (isSecureOrigin()) {
		response.headers.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
	}
}

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
 *
 * Picklists, primer sets, PCR protocols, naming templates, and personnel
 * are intentionally NOT here — regular users can edit those. The
 * admin-only items are user accounts, the DB-snapshot push, and the
 * feedback queue.
 */
const ADMIN_WRITE_PREFIXES = [
	'/api/users', // covers /api/users and /api/users/[id]/...
	'/api/db/',
	'/api/feedback/' // covers /api/feedback/[id] PUT/DELETE
];

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function requiresAdmin(pathname: string, method: string): boolean {
	if (!MUTATING_METHODS.has(method)) {
		// GET /api/feedback is admin-only (list of all feedback)
		if (pathname === '/api/feedback' && method === 'GET') return true;
		// GET /api/users is admin-only (lists local + GitHub users)
		if (pathname === '/api/users' && method === 'GET') return true;
		return false;
	}
	return ADMIN_WRITE_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Routes a viewer (read-only role) is allowed to mutate.
 * Everything else returns 403 for any POST/PUT/PATCH/DELETE.
 *
 * Viewers can still:
 *   - GET any resource they have access to
 *   - Change their own password (POST /api/account/password)
 *   - Submit feedback (POST /api/feedback)
 *   - Sign out (POST /auth/logout — handled outside the /api/ tree)
 */
const VIEWER_WRITE_ALLOWLIST = new Set(['/api/account/password', '/api/feedback']);

function blockedByViewerReadOnly(pathname: string, method: string, role: string | undefined): boolean {
	if (role !== 'viewer') return false;
	if (!MUTATING_METHODS.has(method)) return false;
	if (!pathname.startsWith('/api/')) return false;
	if (VIEWER_WRITE_ALLOWLIST.has(pathname)) return false;
	return true;
}

/**
 * Routes a user with must_change_password=1 is allowed to reach. Everything
 * else gets bounced to /auth/change-password until the flag clears.
 *
 * The change-password page itself, the API that submits the new password,
 * and the logout endpoint all need to be reachable so the user can
 * actually complete (or escape) the flow.
 */
const PASSWORD_CHANGE_ALLOWLIST = new Set([
	'/auth/change-password',
	'/auth/logout',
	'/api/account/password'
]);

function blockedByPasswordChange(pathname: string, user: { must_change_password: number } | null): boolean {
	if (!user || user.must_change_password !== 1) return false;
	if (PASSWORD_CHANGE_ALLOWLIST.has(pathname)) return false;
	// Allow SvelteKit's static asset routes through so the change-password
	// page itself can render its CSS / JS bundles.
	if (pathname.startsWith('/_app/') || pathname === '/favicon.ico') return false;
	return true;
}

/**
 * Public-page allowlist: HTML pages that don't require a session.
 * Everything else (the dashboard, projects, samples, settings, every CRUD
 * page) is gated behind a login — even SSR data is denied to anonymous
 * visitors.
 *
 * Note: /api/* routes are gated separately, above. Static asset paths
 * (/_app/, /favicon.ico) are also allowed unconditionally.
 */
const PUBLIC_PAGE_PREFIXES = [
	'/auth/' // login form, GitHub OAuth callback, pending, change-password
];

function isPublicPage(pathname: string): boolean {
	if (pathname.startsWith('/_app/')) return true;
	if (pathname === '/favicon.ico' || pathname === '/favicon.png') return true;
	return PUBLIC_PAGE_PREFIXES.some((p) => pathname.startsWith(p));
}

export const handle: Handle = async ({ event, resolve }) => {
	// Initialize DB on first request
	getDb();

	// Periodic sweep of expired sessions + oauth states (rate-limited internally).
	maybeSweepExpired();

	// Session-based auth
	const sessionId = event.cookies.get('session');
	event.locals.user = sessionId ? validateSession(sessionId) : null;

	const { pathname } = event.url;
	const method = event.request.method;

	// Centralized API auth gate.
	if (pathname.startsWith('/api/')) {
		if (!event.locals.user && !isPublicApi(pathname, method)) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}
		if (requiresAdmin(pathname, method) && event.locals.user?.role !== 'admin') {
			return json({ error: 'Admin role required' }, { status: 403 });
		}
		if (blockedByViewerReadOnly(pathname, method, event.locals.user?.role)) {
			return json({ error: 'Viewer role is read-only' }, { status: 403 });
		}
	} else if (!isPublicPage(pathname)) {
		// Page-level gate: any non-/api, non-public page requires a session.
		// SvelteKit page loads run server-side and would otherwise serve DB
		// data to anonymous visitors via SSR.
		if (!event.locals.user) {
			const next = encodeURIComponent(pathname + event.url.search);
			throw redirect(302, `/auth/login?next=${next}`);
		}
	}

	// Password-change gate: a user with must_change_password=1 can't reach
	// any route except the change-password page, the password API, and
	// logout. This forces the seeded admin/admin (and any admin-created
	// account with a temporary password) to set a real password before
	// doing anything else.
	if (blockedByPasswordChange(pathname, event.locals.user)) {
		if (pathname.startsWith('/api/')) {
			return json({ error: 'Password change required' }, { status: 403 });
		}
		throw redirect(302, '/auth/change-password');
	}

	const response = await resolve(event);
	applySecurityHeaders(response);
	return response;
};
