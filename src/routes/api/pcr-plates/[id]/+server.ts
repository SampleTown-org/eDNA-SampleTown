import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const plate = db.prepare('SELECT * FROM pcr_plates WHERE id = ? AND is_deleted = 0').get(params.id);
	if (!plate) throw error(404, 'PCR plate not found');
	return json(plate);
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const data = await request.json();
	const db = getDb();
	db.prepare(`
		UPDATE pcr_plates SET plate_name = ?, pcr_date = ?, target_gene = ?, target_subfragment = ?,
			forward_primer_name = ?, forward_primer_seq = ?, reverse_primer_name = ?, reverse_primer_seq = ?,
			pcr_conditions = ?, annealing_temp_c = ?, num_cycles = ?, polymerase = ?, notes = ?,
			sync_version = sync_version + 1, updated_at = datetime('now')
		WHERE id = ?
	`).run(data.plate_name, data.pcr_date ?? null, data.target_gene, data.target_subfragment ?? null,
		data.forward_primer_name ?? null, data.forward_primer_seq ?? null,
		data.reverse_primer_name ?? null, data.reverse_primer_seq ?? null,
		data.pcr_conditions ?? null, data.annealing_temp_c ?? null, data.num_cycles ?? null,
		data.polymerase ?? null, data.notes ?? null, params.id);
	return json(db.prepare('SELECT * FROM pcr_plates WHERE id = ?').get(params.id));
};

export const DELETE: RequestHandler = async ({ params }) => {
	const db = getDb();
	db.prepare("UPDATE pcr_plates SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?").run(params.id);
	return json({ ok: true });
};
