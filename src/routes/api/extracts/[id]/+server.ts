import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const row = db.prepare('SELECT * FROM extracts WHERE id = ? AND is_deleted = 0').get(params.id);
	if (!row) throw error(404, 'Extract not found');
	return json(row);
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const data = await request.json();
	const db = getDb();
	db.prepare(`
		UPDATE extracts SET extract_name = ?, extraction_date = ?, extraction_method = ?, extraction_kit = ?,
			concentration_ng_ul = ?, total_volume_ul = ?, a260_280 = ?, a260_230 = ?, quantification_method = ?,
			storage_location = ?, notes = ?, custom_fields = ?, sync_version = sync_version + 1, updated_at = datetime('now')
		WHERE id = ?
	`).run(data.extract_name, data.extraction_date ?? null, data.extraction_method ?? null, data.extraction_kit ?? null,
		data.concentration_ng_ul ?? null, data.total_volume_ul ?? null, data.a260_280 ?? null, data.a260_230 ?? null,
		data.quantification_method ?? null, data.storage_location ?? null, data.notes ?? null, data.custom_fields ?? null, params.id);
	return json(db.prepare('SELECT * FROM extracts WHERE id = ?').get(params.id));
};

export const DELETE: RequestHandler = async ({ params }) => {
	const db = getDb();
	db.prepare("UPDATE extracts SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?").run(params.id);
	return json({ ok: true });
};
