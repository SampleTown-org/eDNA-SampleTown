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
		.prepare('SELECT * FROM pcr_amplifications WHERE id = ? AND is_deleted = 0 AND lab_id = ?')
		.get(params.id, labId);
	if (!row) throw error(404, 'PCR not found');
	return json(row);
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	try {
		const { labId } = requireLab(locals);
		const data = await request.json();
		if (!data?.pcr_name?.trim()) {
			return json({ error: 'pcr_name is required' }, { status: 400 });
		}
		const db = getDb();
		assertLabOwnsRow(db, 'pcr_amplifications', params.id!, labId, 'PCR not found');
		db.prepare(
			`UPDATE pcr_amplifications SET
				pcr_name = ?, primer_set_id = ?, target_subfragment = ?,
				forward_primer_name = ?, forward_primer_seq = ?, reverse_primer_name = ?, reverse_primer_seq = ?,
				pcr_cond = ?, annealing_temp_c = ?, num_cycles = ?, polymerase = ?, pcr_date = ?,
				band_observed = ?, concentration_ng_ul = ?,
				total_volume_ul = ?, a260_280 = ?, a260_230 = ?, quantification_method = ?,
				notes = ?,
				sync_version = sync_version + 1, updated_at = datetime('now')
			 WHERE id = ?`
		).run(
			data.pcr_name.trim(),
			nn(data.primer_set_id),
			nn(data.target_subfragment),
			nn(data.forward_primer_name),
			nn(data.forward_primer_seq),
			nn(data.reverse_primer_name),
			nn(data.reverse_primer_seq),
			nn(data.pcr_cond),
			data.annealing_temp_c ?? null,
			data.num_cycles ?? null,
			nn(data.polymerase),
			nn(data.pcr_date),
			data.band_observed ?? null,
			data.concentration_ng_ul ?? null,
			data.total_volume_ul ?? null,
			data.a260_280 ?? null,
			data.a260_230 ?? null,
			nn(data.quantification_method),
			nn(data.notes),
			params.id
		);
		return json(db.prepare('SELECT * FROM pcr_amplifications WHERE id = ?').get(params.id));
	} catch (err) {
		return apiError(err);
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	try {
		const { labId } = requireLab(locals);
		const db = getDb();
		assertLabOwnsRow(db, 'pcr_amplifications', params.id!, labId, 'PCR not found');
		db.prepare(
			"UPDATE pcr_amplifications SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?"
		).run(params.id);
		return json({ ok: true });
	} catch (err) {
		return apiError(err);
	}
};
