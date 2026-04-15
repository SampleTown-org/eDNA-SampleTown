import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { requireUser } from '$lib/server/guards';
import { checkRate } from '$lib/server/rate-limit';
import { apiError } from '$lib/server/api-errors';

interface InviteRow {
	token: string;
	lab_id: string;
	role: 'admin' | 'user' | 'viewer';
	expires_at: string;
	used_at: string | null;
}

/**
 * Accept a lab-invite token. Caller must be authenticated. The endpoint
 * works whether the user already has a lab_id or not — joining a different
 * lab moves them entirely (the user record's lab_id is overwritten). For
 * V1 this is fine; once a user belongs to multiple labs we'll need a
 * lab_memberships join table and a lab-switcher.
 */
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
	const user = requireUser(locals);

	const ip = getClientAddress();
	if (!checkRate(`invite-join:${ip}`, 10, 60 * 60_000)) {
		return json({ error: 'Too many join attempts; try again later' }, { status: 429 });
	}

	let token: string;
	try {
		const body = await request.json();
		token = typeof body?.token === 'string' ? body.token.trim() : '';
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	if (!token) return json({ error: 'Token is required' }, { status: 400 });

	try {
		const db = getDb();
		const invite = db
			.prepare(
				'SELECT token, lab_id, role, expires_at, used_at FROM invites WHERE token = ?'
			)
			.get(token) as InviteRow | undefined;
		if (!invite) return json({ error: 'Invite not found' }, { status: 404 });
		if (invite.used_at) return json({ error: 'Invite has already been used' }, { status: 410 });
		if (new Date(invite.expires_at) < new Date()) {
			return json({ error: 'Invite has expired' }, { status: 410 });
		}

		// Atomically consume the invite + assign the user. If two requests
		// race, the WHERE used_at IS NULL clause makes only the first win.
		const tx = db.transaction(() => {
			const consumed = db
				.prepare(
					"UPDATE invites SET used_at = datetime('now'), used_by = ? WHERE token = ? AND used_at IS NULL"
				)
				.run(user.id, token).changes;
			if (consumed === 0) throw new Error('Invite was just used by someone else');
			db.prepare(
				"UPDATE users SET lab_id = ?, role = ?, updated_at = datetime('now') WHERE id = ?"
			).run(invite.lab_id, invite.role, user.id);
		});
		tx();

		const lab = db.prepare('SELECT id, name, slug FROM labs WHERE id = ?').get(invite.lab_id);
		return json({ lab, role: invite.role });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (msg.includes('just used')) return json({ error: msg }, { status: 409 });
		return apiError(err);
	}
};
