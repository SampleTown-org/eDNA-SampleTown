import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { requireUser } from '$lib/server/guards';
import { apiError } from '$lib/server/api-errors';

/**
 * Record that the current user has read and acknowledged the data-governance
 * principles page at /principles. This is a "have you seen this" nudge, not a
 * legal contract — once set, the banner on /account stops showing. Admins can
 * clear it by setting principles_ack_at back to NULL via direct DB access
 * (there's no UI to un-acknowledge).
 */
export const POST: RequestHandler = async ({ locals }) => {
	const user = requireUser(locals);
	try {
		const db = getDb();
		db.prepare(
			"UPDATE users SET principles_ack_at = datetime('now'), updated_at = datetime('now') WHERE id = ?"
		).run(user.id);
		const row = db
			.prepare('SELECT principles_ack_at FROM users WHERE id = ?')
			.get(user.id) as { principles_ack_at: string | null };
		return json({ ok: true, principles_ack_at: row.principles_ack_at });
	} catch (err) {
		return apiError(err);
	}
};
