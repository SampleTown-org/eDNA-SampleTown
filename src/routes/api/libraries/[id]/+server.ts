import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { requireLab } from '$lib/server/guards';
import { assertLabOwnsRow } from '$lib/server/lab-scope';

const nn = (v: unknown): unknown => (typeof v === 'string' && v.trim() === '' ? null : v);

export const GET: RequestHandler = async ({ params, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const row = db
		.prepare('SELECT * FROM library_preps WHERE id = ? AND is_deleted = 0 AND lab_id = ?')
		.get(params.id, labId);
	if (!row) throw error(404, 'Library prep not found');
	return json(row);
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	try {
		const { labId } = requireLab(locals);
		const data = await request.json();
		if (!data?.library_name?.trim()) {
			return json({ error: 'library_name is required' }, { status: 400 });
		}
		if (!data?.library_type) {
			return json({ error: 'library_type is required' }, { status: 400 });
		}
		const db = getDb();
		assertLabOwnsRow(db, 'library_preps', params.id!, labId, 'Library prep not found');
		db.prepare(
			`UPDATE library_preps SET
				library_name = ?, library_type = ?, library_prep_kit = ?,
				library_prep_date = ?, platform = ?, instrument_model = ?,
				index_sequence_i7 = ?, index_sequence_i5 = ?, barcode = ?,
				fragment_size_bp = ?, final_concentration_ng_ul = ?, notes = ?,
				sync_version = sync_version + 1, updated_at = datetime('now')
			 WHERE id = ?`
		).run(
			data.library_name.trim(),
			data.library_type,
			nn(data.library_prep_kit),
			nn(data.library_prep_date),
			nn(data.platform),
			nn(data.instrument_model),
			nn(data.index_sequence_i7),
			nn(data.index_sequence_i5),
			nn(data.barcode),
			data.fragment_size_bp ?? null,
			data.final_concentration_ng_ul ?? null,
			nn(data.notes),
			params.id
		);
		return json(db.prepare('SELECT * FROM library_preps WHERE id = ?').get(params.id));
	} catch (err) {
		return apiError(err);
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	try {
		const { labId } = requireLab(locals);
		const db = getDb();
		assertLabOwnsRow(db, 'library_preps', params.id!, labId, 'Library prep not found');
		db.prepare(
			"UPDATE library_preps SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?"
		).run(params.id);
		return json({ ok: true });
	} catch (err) {
		return apiError(err);
	}
};
