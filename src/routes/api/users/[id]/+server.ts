import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { requireLabAdmin } from '$lib/server/guards';
import { parseBody } from '$lib/server/validation';
import { UserUpdateBody } from '$lib/server/schemas/auth';

const SAFE_USER_LIST_COLS = `
	id, lab_id, github_id, username, display_name, email, avatar_url, avatar_emoji,
	role, is_local_account, is_approved, must_change_password,
	created_at, updated_at,
	(password_hash IS NOT NULL) AS has_password
`;

/** Edit role / approval / display fields / lab assignment. Cannot edit own role (anti-lockout). */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const { user: me, labId } = requireLabAdmin(locals);

	const parsed = parseBody(UserUpdateBody, await request.json().catch(() => null));
	if (!parsed.ok) return parsed.response;
	const data = parsed.data;

	try {
		const db = getDb();
		const target = db
			.prepare('SELECT id, role, lab_id FROM users WHERE id = ?')
			.get(params.id) as { id: string; role: string; lab_id: string | null } | undefined;
		if (!target) throw error(404, 'User not found');

		// Cross-lab guard: a lab-admin can only edit users in their own lab
		// OR users who are currently unassigned (pending approval). Otherwise
		// 404 — don't confirm the target exists in another lab.
		if (target.lab_id !== null && target.lab_id !== labId) {
			throw error(404, 'User not found');
		}

		const role = data.role ?? target.role;

		// Anti-lockout: an admin cannot demote themselves. They must promote
		// another admin first, then have that admin demote them.
		if (target.id === me.id && role !== 'admin') {
			return json(
				{ error: 'You cannot demote yourself. Promote another admin first.' },
				{ status: 400 }
			);
		}

		// A lab-admin can only assign users to *their own* lab. Assigning to
		// a different lab is not allowed — use scripts/create-lab.mjs for
		// cross-lab moves. `undefined` means "don't touch", `null` means
		// "unset", and a string must match the caller's lab_id.
		let newLabId: string | null | undefined = data.lab_id;
		if (newLabId !== undefined && newLabId !== null && newLabId !== labId) {
			return json(
				{ error: 'Can only assign users to your own lab' },
				{ status: 403 }
			);
		}
		// Anti-lockout: an admin cannot unset their own lab_id.
		if (target.id === me.id && newLabId === null) {
			return json(
				{ error: 'You cannot unassign yourself from your own lab.' },
				{ status: 400 }
			);
		}

		db.prepare(
			`UPDATE users
			   SET role = ?,
			       is_approved = COALESCE(?, is_approved),
			       display_name = COALESCE(?, display_name),
			       email = COALESCE(?, email),
			       lab_id = CASE
			         WHEN ? = 1 THEN ?
			         ELSE lab_id
			       END,
			       updated_at = datetime('now')
			 WHERE id = ?`
		).run(
			role,
			data.is_approved ?? null,
			data.display_name ?? null,
			data.email ?? null,
			newLabId === undefined ? 0 : 1,
			newLabId ?? null,
			params.id
		);

		const updated = db
			.prepare(`SELECT ${SAFE_USER_LIST_COLS} FROM users WHERE id = ?`)
			.get(params.id);
		return json(updated);
	} catch (err) {
		return apiError(err);
	}
};

/** Soft-delete a user. Keeps the row (so created_by / user_id
 *  references to it still resolve for attribution — dashboard
 *  activities, people rosters, etc.) but flips is_deleted=1,
 *  revokes all sessions, and clears the password so a resurrected
 *  row can't still log in with the old credential. */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	const { user: me, labId } = requireLabAdmin(locals);
	if (params.id === me.id) {
		return json({ error: 'You cannot delete your own account' }, { status: 400 });
	}
	try {
		const db = getDb();
		// Same-lab check as PUT — 404 if the target belongs to another lab.
		const target = db.prepare('SELECT lab_id FROM users WHERE id = ? AND is_deleted = 0').get(params.id) as
			| { lab_id: string | null }
			| undefined;
		if (!target || (target.lab_id !== null && target.lab_id !== labId)) {
			throw error(404, 'User not found');
		}
		const deleted = db.transaction(() => {
			db.prepare('DELETE FROM sessions WHERE user_id = ?').run(params.id);
			return db.prepare(
				`UPDATE users
				   SET is_deleted = 1,
				       password_hash = NULL,
				       is_approved = 0,
				       must_change_password = 0,
				       updated_at = datetime('now')
				 WHERE id = ? AND is_deleted = 0`
			).run(params.id).changes;
		})();
		if (deleted === 0) throw error(404, 'User not found');
		return json({ ok: true });
	} catch (err) {
		return apiError(err);
	}
};
