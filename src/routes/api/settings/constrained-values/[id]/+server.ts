import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

export const PUT: RequestHandler = async ({ params, request }) => {
	const data = await request.json();
	const db = getDb();
	try {
		db.prepare('UPDATE constrained_values SET value = ?, label = ?, sort_order = ?, is_active = ? WHERE id = ?').run(
			data.value, data.label || null, data.sort_order ?? 0, data.is_active ?? 1, params.id
		);
		return json(db.prepare('SELECT * FROM constrained_values WHERE id = ?').get(params.id));
	} catch (err: any) {
		return json({ error: err.message }, { status: 400 });
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	const db = getDb();
	db.prepare('DELETE FROM constrained_values WHERE id = ?').run(params.id);
	return json({ ok: true });
};
