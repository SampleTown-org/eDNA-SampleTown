import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { setUserPassword } from '$lib/server/auth';
import { apiError } from '$lib/server/api-errors';
import { requireLabAdmin } from '$lib/server/guards';
import { parseBody } from '$lib/server/validation';
import { UserCreateBody } from '$lib/server/schemas/auth';

// Both endpoints require admin via the centralized gate in hooks.server.ts;
// the requireLabAdmin call below also narrows to the caller's lab_id.

// User row shape returned to admins. Includes is_approved + must_change_password
// + auth-source flags but NOT password_hash.
const SAFE_USER_LIST_COLS = `
	id, lab_id, github_id, username, display_name, email, avatar_url, avatar_emoji,
	role, is_local_account, is_approved, must_change_password,
	created_at, updated_at,
	(password_hash IS NOT NULL) AS has_password
`;

export const GET: RequestHandler = async ({ locals }) => {
	const { labId } = requireLabAdmin(locals);
	const db = getDb();
	// Lab-scoped user list: the caller's own lab members plus any OAuth
	// signups with lab_id=NULL (pending admin assignment). Any admin can
	// assign a pending user to their own lab via PUT /api/users/[id].
	const users = db.prepare(
		`SELECT ${SAFE_USER_LIST_COLS}
		 FROM users
		 WHERE is_deleted = 0 AND (lab_id = ? OR lab_id IS NULL)
		 ORDER BY username`
	).all(labId);
	return json(users);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const { labId } = requireLabAdmin(locals);
	const parsed = parseBody(UserCreateBody, await request.json().catch(() => null));
	if (!parsed.ok) return parsed.response;
	const data = parsed.data;

	try {
		const id = generateId();
		const db = getDb();
		// New admin-created local accounts join the creating admin's lab.
		// Cross-lab account creation (moving a user into another lab) is
		// not supported via this endpoint — use scripts/create-lab.mjs +
		// direct DB edits, or re-assign via PUT /api/users/[id] after
		// create.
		db.prepare(
			`INSERT INTO users (id, lab_id, username, display_name, email, role, is_local_account, is_approved, must_change_password)
			 VALUES (?, ?, ?, ?, ?, ?, 1, 1, 1)`
		).run(id, labId, data.username, data.display_name ?? null, data.email ?? null, data.role);
		await setUserPassword(id, data.password);
		// setUserPassword clears must_change_password — re-set it so the new
		// user is forced to change the temp password on first login.
		db.prepare('UPDATE users SET must_change_password = 1 WHERE id = ?').run(id);

		const user = db.prepare(`SELECT ${SAFE_USER_LIST_COLS} FROM users WHERE id = ?`).get(id);
		return json(user, { status: 201 });
	} catch (err) {
		return apiError(err);
	}
};
