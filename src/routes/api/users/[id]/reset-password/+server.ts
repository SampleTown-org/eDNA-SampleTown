import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { setUserPassword } from '$lib/server/auth';
import { apiError } from '$lib/server/api-errors';
import { requireAdmin } from '$lib/server/guards';
import { parseBody } from '$lib/server/validation';
import { ResetPasswordBody } from '$lib/server/schemas/auth';

/**
 * Admin resets another user's password to a temporary value.
 *
 * Sets must_change_password=1 so the user is forced to change it on next
 * login. Also revokes all of the user's existing sessions so the old
 * password (if leaked) can't be used to keep an active foothold.
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	requireAdmin(locals);

	const parsed = parseBody(ResetPasswordBody, await request.json().catch(() => null));
	if (!parsed.ok) return parsed.response;

	try {
		const db = getDb();
		const target = db.prepare('SELECT id FROM users WHERE id = ?').get(params.id);
		if (!target) return json({ error: 'User not found' }, { status: 404 });

		// setUserPassword clears must_change_password — re-set it after.
		await setUserPassword(params.id!, parsed.data.password);
		db.prepare('UPDATE users SET must_change_password = 1 WHERE id = ?').run(params.id);
		// Revoke any active sessions for this user.
		db.prepare('DELETE FROM sessions WHERE user_id = ?').run(params.id);

		return json({ ok: true });
	} catch (err) {
		return apiError(err);
	}
};
