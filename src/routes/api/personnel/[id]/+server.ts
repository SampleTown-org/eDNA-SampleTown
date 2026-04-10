import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

export const PUT: RequestHandler = async ({ params, request }) => {
	const data = await request.json();
	const db = getDb();
	try {
		db.prepare(`UPDATE personnel SET full_name = ?, email = ?, role = ?, institution = ?,
			orcid = ?, user_id = ?, is_active = ?, sort_order = ? WHERE id = ?`).run(
			data.full_name, data.email || null, data.role || null,
			data.institution || null, data.orcid || null, data.user_id || null,
			data.is_active ?? 1, data.sort_order ?? 0, params.id
		);
		return json(db.prepare('SELECT p.*, u.username AS github_username FROM personnel p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?').get(params.id));
	} catch (err: any) {
		return json({ error: err.message }, { status: 400 });
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	const db = getDb();
	db.prepare('DELETE FROM personnel WHERE id = ?').run(params.id);
	return json({ ok: true });
};
