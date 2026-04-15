import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { requireUser } from '$lib/server/guards';
import { apiError } from '$lib/server/api-errors';
import { sessionCookieOptions } from '$lib/server/auth';

/**
 * Self-delete the current user. Mirror of the admin DELETE
 * /api/users/[id] flow but called by the user against themselves.
 *
 * Anti-orphan: refuses if the caller is the last admin of their lab —
 * that would leave the lab with no one able to manage it. They have to
 * either promote another admin first OR delete the lab entirely (which
 * sets every member's lab_id back to NULL and lets them rejoin or
 * create a new lab).
 *
 * Confirmation: the request body must include `confirm: "<username>"`
 * to stop a stolen-cookie attacker from one-clicking your account out
 * of existence. Same pattern GitHub uses for destructive ops.
 */
export const DELETE: RequestHandler = async ({ request, locals, cookies }) => {
	const user = requireUser(locals);
	let body: { confirm?: unknown };
	try {
		body = await request.json();
	} catch {
		body = {};
	}
	if (typeof body.confirm !== 'string' || body.confirm !== user.username) {
		return json(
			{ error: `Type your username (${user.username}) into the confirmation field to delete your account.` },
			{ status: 400 }
		);
	}

	try {
		const db = getDb();

		// Last-admin check. Counts other approved, non-deleted admins in the
		// same lab. lab_id NULL means the user never joined a lab — they
		// can self-delete unconditionally.
		if (user.lab_id && user.role === 'admin') {
			const otherAdmins = (db
				.prepare(
					`SELECT COUNT(*) AS c FROM users
					 WHERE lab_id = ? AND role = 'admin'
					   AND id != ? AND is_deleted = 0 AND is_approved = 1`
				)
				.get(user.lab_id, user.id) as { c: number }).c;
			if (otherAdmins === 0) {
				return json(
					{
						error:
							"You're the only admin of your lab. Promote another member to admin first, or delete the lab from Manage → Danger before deleting your account."
					},
					{ status: 409 }
				);
			}
		}

		const deleted = db.transaction(() => {
			db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
			return db
				.prepare(
					`UPDATE users
					   SET is_deleted = 1,
					       password_hash = NULL,
					       is_approved = 0,
					       must_change_password = 0,
					       updated_at = datetime('now')
					 WHERE id = ? AND is_deleted = 0`
				)
				.run(user.id).changes;
		})();
		if (deleted === 0) return json({ error: 'Account not found' }, { status: 404 });

		// Wipe the caller's session cookie so the very response they get
		// back from this DELETE doesn't still look "logged in".
		cookies.delete('session', sessionCookieOptions());

		return json({ ok: true });
	} catch (err) {
		return apiError(err);
	}
};
