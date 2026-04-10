import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';

const nn = (v: unknown): unknown => (typeof v === 'string' && v.trim() === '' ? null : v);

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const plate = db
		.prepare('SELECT * FROM library_plates WHERE id = ? AND is_deleted = 0')
		.get(params.id);
	if (!plate) throw error(404, 'Library plate not found');
	return json(plate);
};

export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const data = await request.json();
		if (!data?.plate_name?.trim()) {
			return json({ error: 'plate_name is required' }, { status: 400 });
		}
		if (!data?.library_type) {
			return json({ error: 'library_type is required' }, { status: 400 });
		}
		const db = getDb();
		db.prepare(
			`UPDATE library_plates SET
				plate_name = ?, library_prep_date = ?, library_type = ?,
				library_prep_kit = ?, platform = ?, instrument_model = ?, fragment_size_bp = ?,
				notes = ?, sync_version = sync_version + 1, updated_at = datetime('now')
			 WHERE id = ?`
		).run(
			data.plate_name.trim(),
			nn(data.library_prep_date),
			data.library_type,
			nn(data.library_prep_kit),
			nn(data.platform),
			nn(data.instrument_model),
			data.fragment_size_bp ?? null,
			nn(data.notes),
			params.id
		);
		return json(db.prepare('SELECT * FROM library_plates WHERE id = ?').get(params.id));
	} catch (err) {
		return apiError(err);
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const db = getDb();
		db.prepare(
			"UPDATE library_plates SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?"
		).run(params.id);
		return json({ ok: true });
	} catch (err) {
		return apiError(err);
	}
};
