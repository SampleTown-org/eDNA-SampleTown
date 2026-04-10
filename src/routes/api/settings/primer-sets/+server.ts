import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';

export const GET: RequestHandler = async () => {
	const db = getDb();
	return json(db.prepare('SELECT * FROM primer_sets WHERE is_active = 1 ORDER BY sort_order, name').all());
};

export const POST: RequestHandler = async ({ request }) => {
	const data = await request.json();
	const db = getDb();
	const id = generateId();
	try {
		db.prepare(`INSERT INTO primer_sets (id, name, target_gene, target_subfragment, forward_primer_name, forward_primer_seq, reverse_primer_name, reverse_primer_seq, reference, sort_order)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, data.name, data.target_gene, data.target_subfragment ?? null,
			data.forward_primer_name ?? null, data.forward_primer_seq ?? null, data.reverse_primer_name ?? null, data.reverse_primer_seq ?? null,
			data.reference ?? null, data.sort_order ?? 0);
		return json(db.prepare('SELECT * FROM primer_sets WHERE id = ?').get(id), { status: 201 });
	} catch (err) { return apiError(err); }
};
