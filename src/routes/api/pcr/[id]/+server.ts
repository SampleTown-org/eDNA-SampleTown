import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const row = db.prepare('SELECT * FROM pcr_amplifications WHERE id = ? AND is_deleted = 0').get(params.id);
	if (!row) throw error(404, 'PCR not found');
	return json(row);
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const data = await request.json();
	const db = getDb();
	db.prepare(`
		UPDATE pcr_amplifications SET pcr_name = ?, target_gene = ?, target_subfragment = ?,
			forward_primer_name = ?, forward_primer_seq = ?, reverse_primer_name = ?, reverse_primer_seq = ?,
			pcr_conditions = ?, annealing_temp_c = ?, num_cycles = ?, polymerase = ?, pcr_date = ?,
			band_observed = ?, concentration_ng_ul = ?, notes = ?,
			sync_version = sync_version + 1, updated_at = datetime('now')
		WHERE id = ?
	`).run(data.pcr_name, data.target_gene, data.target_subfragment ?? null,
		data.forward_primer_name ?? null, data.forward_primer_seq ?? null,
		data.reverse_primer_name ?? null, data.reverse_primer_seq ?? null,
		data.pcr_conditions ?? null, data.annealing_temp_c ?? null, data.num_cycles ?? null,
		data.polymerase ?? null, data.pcr_date ?? null,
		data.band_observed ?? null, data.concentration_ng_ul ?? null, data.notes ?? null, params.id);
	return json(db.prepare('SELECT * FROM pcr_amplifications WHERE id = ?').get(params.id));
};

export const DELETE: RequestHandler = async ({ params }) => {
	const db = getDb();
	db.prepare("UPDATE pcr_amplifications SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?").run(params.id);
	return json({ ok: true });
};
