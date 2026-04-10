import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';

export const PUT: RequestHandler = async ({ params, request }) => {
	const data = await request.json();
	const db = getDb();
	try {
		db.prepare(`UPDATE primer_sets SET name = ?, target_gene = ?, target_subfragment = ?,
			forward_primer_name = ?, forward_primer_seq = ?, reverse_primer_name = ?, reverse_primer_seq = ?,
			reference = ?, is_active = ?, sort_order = ? WHERE id = ?`).run(
			data.name, data.target_gene, data.target_subfragment ?? null,
			data.forward_primer_name ?? null, data.forward_primer_seq ?? null,
			data.reverse_primer_name ?? null, data.reverse_primer_seq ?? null,
			data.reference ?? null, data.is_active ?? 1, data.sort_order ?? 0, params.id);
		return json(db.prepare('SELECT * FROM primer_sets WHERE id = ?').get(params.id));
	} catch (err) { return apiError(err); }
};

export const DELETE: RequestHandler = async ({ params }) => {
	const db = getDb();
	db.prepare('DELETE FROM primer_sets WHERE id = ?').run(params.id);
	return json({ ok: true });
};
