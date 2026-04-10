import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const row = db.prepare('SELECT * FROM library_preps WHERE id = ? AND is_deleted = 0').get(params.id);
	if (!row) throw error(404, 'Library prep not found');
	return json(row);
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const data = await request.json();
	const db = getDb();
	db.prepare(`
		UPDATE library_preps SET library_name = ?, library_type = ?, library_prep_kit = ?,
			library_prep_date = ?, platform = ?, instrument_model = ?,
			index_sequence_i7 = ?, index_sequence_i5 = ?, barcode = ?,
			fragment_size_bp = ?, final_concentration_ng_ul = ?, notes = ?,
			sync_version = sync_version + 1, updated_at = datetime('now')
		WHERE id = ?
	`).run(data.library_name, data.library_type, data.library_prep_kit ?? null,
		data.library_prep_date ?? null, data.platform ?? null, data.instrument_model ?? null,
		data.index_sequence_i7 ?? null, data.index_sequence_i5 ?? null, data.barcode ?? null,
		data.fragment_size_bp ?? null, data.final_concentration_ng_ul ?? null,
		data.notes ?? null, params.id);
	return json(db.prepare('SELECT * FROM library_preps WHERE id = ?').get(params.id));
};

export const DELETE: RequestHandler = async ({ params }) => {
	const db = getDb();
	db.prepare("UPDATE library_preps SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?").run(params.id);
	return json({ ok: true });
};
