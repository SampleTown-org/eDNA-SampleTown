import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { requireLabAdmin } from '$lib/server/guards';
import { apiError } from '$lib/server/api-errors';

/**
 * Delete the caller's lab. WIPES every project, sample, site, extract,
 * PCR plate / amp, library plate / prep, sequencing run + run-libraries
 * link, analysis, personnel, picklist, primer set, pcr protocol, saved
 * cart, invite, db_snapshot, and feedback row owned by this lab.
 *
 * Existing users in the lab are NOT deleted. Their lab_id is set to
 * NULL and role reverts to 'user' — they hit the lab-setup gate on
 * their next page load and can either start a new lab or accept an
 * invite. Their sessions are wiped so a stale tab can't keep operating
 * on a half-gone lab.
 *
 * Confirmation: body must include `confirm: "<lab name>"` (case-sensitive,
 * the literal name, not slug). GitHub-style "type the name to confirm"
 * pattern. The whole operation runs in a transaction so a partial wipe
 * can't happen.
 */
export const DELETE: RequestHandler = async ({ request, locals, cookies }) => {
	const { user, labId } = requireLabAdmin(locals);
	const callerSessionId = cookies.get('session');

	let body: { confirm?: unknown };
	try {
		body = await request.json();
	} catch {
		body = {};
	}

	try {
		const db = getDb();
		const lab = db
			.prepare('SELECT id, name, slug FROM labs WHERE id = ?')
			.get(labId) as { id: string; name: string; slug: string } | undefined;
		if (!lab) return json({ error: 'Lab not found' }, { status: 404 });

		if (typeof body.confirm !== 'string' || body.confirm !== lab.name) {
			return json(
				{ error: `Type the lab name (${lab.name}) into the confirmation field to delete this lab.` },
				{ status: 400 }
			);
		}

		// foreign_keys was turned ON in getDb(), so the DELETE FROM labs
		// below cascades through every CASCADE-configured FK (projects →
		// sites/samples/extracts/etc., personnel, picklists, primer sets,
		// pcr protocols, saved_carts, db_snapshots, invites, feedback).
		// users.lab_id is the only no-cascade FK touching labs — null it
		// out first so the DELETE doesn't fail with a constraint error.
		db.transaction(() => {
			// Drop sessions for everyone in this lab so half-loaded tabs
			// don't keep operating against deleted data — EXCEPT the
			// deleting admin's own session, so they get gracefully
			// redirected to /auth/setup-lab on their next request rather
			// than booted out to /auth/login mid-flow.
			if (callerSessionId) {
				db.prepare(
					`DELETE FROM sessions
					 WHERE user_id IN (SELECT id FROM users WHERE lab_id = ?)
					   AND id != ?`
				).run(labId, callerSessionId);
			} else {
				db.prepare(
					'DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE lab_id = ?)'
				).run(labId);
			}
			db.prepare(
				"UPDATE users SET lab_id = NULL, role = 'user', updated_at = datetime('now') WHERE lab_id = ?"
			).run(labId);
			db.prepare('DELETE FROM labs WHERE id = ?').run(labId);
		})();

		return json({ ok: true, name: lab.name });
	} catch (err) {
		return apiError(err);
	}
};
