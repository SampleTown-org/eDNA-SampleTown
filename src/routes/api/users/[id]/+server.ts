import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { requireAdmin } from '$lib/server/guards';

const VALID_ROLES = new Set(['admin', 'user', 'viewer']);

const SAFE_USER_LIST_COLS = `
	id, github_id, username, display_name, email, avatar_url,
	role, is_local_account, is_approved, must_change_password,
	created_at, updated_at,
	(password_hash IS NOT NULL) AS has_password
`;

/** Edit role / approval / display fields. Cannot edit own role (anti-lockout). */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const me = requireAdmin(locals);
	try {
		const data = await request.json();
		const db = getDb();
		const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(params.id) as
			| { id: string; role: string }
			| undefined;
		if (!target) throw error(404, 'User not found');

		const role = data?.role !== undefined ? String(data.role) : target.role;
		if (!VALID_ROLES.has(role)) return json({ error: 'invalid role' }, { status: 400 });

		// Anti-lockout: an admin cannot demote themselves. They must promote
		// another admin first, then have that admin demote them.
		if (target.id === me.id && role !== 'admin') {
			return json(
				{ error: 'You cannot demote yourself. Promote another admin first.' },
				{ status: 400 }
			);
		}

		const isApproved =
			data?.is_approved !== undefined ? (data.is_approved ? 1 : 0) : null;
		const displayName = data?.display_name !== undefined ? String(data.display_name).trim() || null : null;
		const email = data?.email !== undefined ? String(data.email).trim() || null : null;

		db.prepare(
			`UPDATE users
			   SET role = ?,
			       is_approved = COALESCE(?, is_approved),
			       display_name = COALESCE(?, display_name),
			       email = COALESCE(?, email),
			       updated_at = datetime('now')
			 WHERE id = ?`
		).run(role, isApproved, displayName, email, params.id);

		const updated = db
			.prepare(`SELECT ${SAFE_USER_LIST_COLS} FROM users WHERE id = ?`)
			.get(params.id);
		return json(updated);
	} catch (err) {
		return apiError(err);
	}
};

/** Delete a user. Cannot delete self. Cascades to sessions via FK. */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	const me = requireAdmin(locals);
	if (params.id === me.id) {
		return json({ error: 'You cannot delete your own account' }, { status: 400 });
	}
	try {
		const db = getDb();
		const result = db.prepare('DELETE FROM users WHERE id = ?').run(params.id);
		if (result.changes === 0) throw error(404, 'User not found');
		return json({ ok: true });
	} catch (err) {
		return apiError(err);
	}
};
