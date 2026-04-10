import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';

const nn = (v: unknown): unknown => (typeof v === 'string' && v.trim() === '' ? null : v);

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const plate = db.prepare('SELECT * FROM pcr_plates WHERE id = ? AND is_deleted = 0').get(params.id);
	if (!plate) throw error(404, 'PCR plate not found');
	return json(plate);
};

export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const data = await request.json();
		if (!data?.plate_name?.trim()) {
			return json({ error: 'plate_name is required' }, { status: 400 });
		}
		if (!data?.target_gene) {
			return json({ error: 'target_gene is required' }, { status: 400 });
		}
		const db = getDb();
		db.prepare(
			`UPDATE pcr_plates SET
				plate_name = ?, pcr_date = ?, target_gene = ?, target_subfragment = ?,
				forward_primer_name = ?, forward_primer_seq = ?, reverse_primer_name = ?, reverse_primer_seq = ?,
				pcr_conditions = ?, annealing_temp_c = ?, num_cycles = ?, polymerase = ?, notes = ?,
				sync_version = sync_version + 1, updated_at = datetime('now')
			 WHERE id = ?`
		).run(
			data.plate_name.trim(),
			nn(data.pcr_date),
			data.target_gene,
			nn(data.target_subfragment),
			nn(data.forward_primer_name),
			nn(data.forward_primer_seq),
			nn(data.reverse_primer_name),
			nn(data.reverse_primer_seq),
			nn(data.pcr_conditions),
			data.annealing_temp_c ?? null,
			data.num_cycles ?? null,
			nn(data.polymerase),
			nn(data.notes),
			params.id
		);
		return json(db.prepare('SELECT * FROM pcr_plates WHERE id = ?').get(params.id));
	} catch (err) {
		return apiError(err);
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const db = getDb();
		db.prepare(
			"UPDATE pcr_plates SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?"
		).run(params.id);
		return json({ ok: true });
	} catch (err) {
		return apiError(err);
	}
};
