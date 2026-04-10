import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const plate = db.prepare('SELECT * FROM library_plates WHERE id = ? AND is_deleted = 0').get(params.id);
	if (!plate) throw error(404, 'Library plate not found');
	return json(plate);
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const data = await request.json();
	const db = getDb();
	db.prepare(`
		UPDATE library_plates SET plate_name = ?, library_prep_date = ?, library_type = ?,
			library_prep_kit = ?, platform = ?, instrument_model = ?, fragment_size_bp = ?,
			notes = ?, sync_version = sync_version + 1, updated_at = datetime('now')
		WHERE id = ?
	`).run(data.plate_name, data.library_prep_date ?? null, data.library_type,
		data.library_prep_kit ?? null, data.platform ?? null, data.instrument_model ?? null,
		data.fragment_size_bp ?? null, data.notes ?? null, params.id);
	return json(db.prepare('SELECT * FROM library_plates WHERE id = ?').get(params.id));
};

export const DELETE: RequestHandler = async ({ params }) => {
	const db = getDb();
	db.prepare("UPDATE library_plates SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?").run(params.id);
	return json({ ok: true });
};
