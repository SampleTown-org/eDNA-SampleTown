import { error } from '@sveltejs/kit';
import type { User } from '$lib/types';

/**
 * Throw a 401 if the request is not authenticated.
 * Use at the top of any API handler that mutates data.
 */
export function requireUser(locals: App.Locals): User {
	if (!locals.user) throw error(401, 'Authentication required');
	return locals.user;
}

/**
 * Throw a 403 if the request is not from an admin.
 * Use for settings, personnel, db snapshots, feedback management.
 */
export function requireAdmin(locals: App.Locals): User {
	const u = requireUser(locals);
	if (u.role !== 'admin') throw error(403, 'Admin role required');
	return u;
}
