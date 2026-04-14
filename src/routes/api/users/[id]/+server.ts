import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { requireAdmin } from '$lib/server/guards';
import { parseBody } from '$lib/server/validation';
import { UserUpdateBody } from '$lib/server/schemas/auth';

const SAFE_USER_LIST_COLS = `
	id, github_id, username, display_name, email, avatar_url, avatar_emoji,
	role, is_local_account, is_approved, must_change_password,
	created_at, updated_at,
	(password_hash IS NOT NULL) AS has_password
`;

/** Edit role / approval / display fields. Cannot edit own role (anti-lockout). */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const me = requireAdmin(locals);

	const parsed = parseBody(UserUpdateBody, await request.json().catch(() => null));
	if (!parsed.ok) return parsed.response;
	const data = parsed.data;

	try {
		const db = getDb();
		const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(params.id) as
			| { id: string; role: string }
			| undefined;
		if (!target) throw error(404, 'User not found');

		const role = data.role ?? target.role;

		// Anti-lockout: an admin cannot demote themselves. They must promote
		// another admin first, then have that admin demote them.
		if (target.id === me.id && role !== 'admin') {
			return json(
				{ error: 'You cannot demote yourself. Promote another admin first.' },
				{ status: 400 }
			);
		}

		db.prepare(
			`UPDATE users
			   SET role = ?,
			       is_approved = COALESCE(?, is_approved),
			       display_name = COALESCE(?, display_name),
			       email = COALESCE(?, email),
			       updated_at = datetime('now')
			 WHERE id = ?`
		).run(
			role,
			data.is_approved ?? null,
			data.display_name ?? null,
			data.email ?? null,
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

/** Every table that has a non-cascading `created_by` / `user_id` →
 *  users(id) reference. When deleting a user we NULL these out inside
 *  the same transaction so the FK constraint doesn't block the delete.
 *  (Sessions and saved_carts cascade automatically.) */
const USER_NULLABLE_REFS: { table: string; col: string }[] = [
	{ table: 'projects', col: 'created_by' },
	{ table: 'sites', col: 'created_by' },
	{ table: 'samples', col: 'created_by' },
	{ table: 'extracts', col: 'created_by' },
	{ table: 'pcr_plates', col: 'created_by' },
	{ table: 'pcr_amplifications', col: 'created_by' },
	{ table: 'library_plates', col: 'created_by' },
	{ table: 'library_preps', col: 'created_by' },
	{ table: 'sequencing_runs', col: 'created_by' },
	{ table: 'analyses', col: 'created_by' },
	{ table: 'site_photos', col: 'created_by' },
	{ table: 'sample_photos', col: 'created_by' },
	{ table: 'personnel', col: 'user_id' },
	{ table: 'feedback', col: 'user_id' }
];

/** Delete a user. Cannot delete self. Nulls out created_by/user_id
 *  references across the data tables (so historical records persist
 *  as authored-by-nobody); cascades sessions + saved_carts via FK. */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	const me = requireAdmin(locals);
	if (params.id === me.id) {
		return json({ error: 'You cannot delete your own account' }, { status: 400 });
	}
	try {
		const db = getDb();
		const deleted = db.transaction(() => {
			for (const { table, col } of USER_NULLABLE_REFS) {
				db.prepare(`UPDATE ${table} SET ${col} = NULL WHERE ${col} = ?`).run(params.id);
			}
			return db.prepare('DELETE FROM users WHERE id = ?').run(params.id).changes;
		})();
		if (deleted === 0) throw error(404, 'User not found');
		return json({ ok: true });
	} catch (err) {
		return apiError(err);
	}
};
