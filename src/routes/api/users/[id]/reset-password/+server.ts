import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { setUserPassword } from '$lib/server/auth';
import { apiError } from '$lib/server/api-errors';
import { requireAdmin } from '$lib/server/guards';

/**
 * Admin resets another user's password to a temporary value.
 *
 * Sets must_change_password=1 so the user is forced to change it on next
 * login. Also revokes all of the user's existing sessions so the old
 * password (if leaked) can't be used to keep an active foothold.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	requireAdmin(locals);
	try {
		const data = await request.json();
		const password = String(data?.password ?? '');
		if (!password) {
			return json({ error: 'password is required' }, { status: 400 });
		}

		const db = getDb();
		const target = db.prepare('SELECT id FROM users WHERE id = ?').get(params.id);
		if (!target) return json({ error: 'User not found' }, { status: 404 });

		// setUserPassword clears must_change_password — re-set it after.
		try {
			await setUserPassword(params.id!, password);
		} catch (err) {
			if (err instanceof Error && /^Password must be/.test(err.message)) {
				return json({ error: err.message }, { status: 400 });
			}
			throw err;
		}
		db.prepare('UPDATE users SET must_change_password = 1 WHERE id = ?').run(params.id);
		// Revoke any active sessions for this user.
		db.prepare('DELETE FROM sessions WHERE user_id = ?').run(params.id);

		return json({ ok: true });
	} catch (err) {
		return apiError(err);
	}
};
