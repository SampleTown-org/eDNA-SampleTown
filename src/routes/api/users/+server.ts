import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { setUserPassword, validatePasswordPolicy } from '$lib/server/auth';
import { apiError } from '$lib/server/api-errors';

// Both endpoints require admin via the centralized gate in hooks.server.ts.

const VALID_ROLES = new Set(['admin', 'user', 'viewer']);

// User row shape returned to admins. Includes is_approved + must_change_password
// + auth-source flags but NOT password_hash.
const SAFE_USER_LIST_COLS = `
	id, github_id, username, display_name, email, avatar_url,
	role, is_local_account, is_approved, must_change_password,
	created_at, updated_at,
	(password_hash IS NOT NULL) AS has_password
`;

export const GET: RequestHandler = async () => {
	const db = getDb();
	const users = db.prepare(`SELECT ${SAFE_USER_LIST_COLS} FROM users ORDER BY username`).all();
	return json(users);
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const data = await request.json();
		const username = String(data?.username ?? '').trim();
		const password = String(data?.password ?? '');
		const role = String(data?.role ?? 'user');
		const display_name = data?.display_name ? String(data.display_name).trim() : null;
		const email = data?.email ? String(data.email).trim() : null;

		if (!username) return json({ error: 'username is required' }, { status: 400 });
		if (!VALID_ROLES.has(role)) return json({ error: 'invalid role' }, { status: 400 });

		// Throws an Error with a safe message if the password is too short/long.
		try {
			validatePasswordPolicy(password);
		} catch (err) {
			return json({ error: err instanceof Error ? err.message : 'invalid password' }, { status: 400 });
		}

		const id = generateId();
		const db = getDb();
		// Create the row with a placeholder hash; setUserPassword overwrites it.
		// We do it this way so the bcrypt cost lives in one place (auth.ts).
		db.prepare(
			`INSERT INTO users (id, username, display_name, email, role, is_local_account, is_approved, must_change_password)
			 VALUES (?, ?, ?, ?, ?, 1, 1, 1)`
		).run(id, username, display_name, email, role);
		await setUserPassword(id, password);
		// setUserPassword clears must_change_password — re-set it so the new
		// user is forced to change the temp password on first login.
		db.prepare("UPDATE users SET must_change_password = 1 WHERE id = ?").run(id);

		const user = db
			.prepare(`SELECT ${SAFE_USER_LIST_COLS} FROM users WHERE id = ?`)
			.get(id);
		return json(user, { status: 201 });
	} catch (err) {
		return apiError(err);
	}
};
