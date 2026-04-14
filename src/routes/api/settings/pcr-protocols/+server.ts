import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';

export const GET: RequestHandler = async () => {
	const db = getDb();
	return json(db.prepare('SELECT * FROM pcr_protocols WHERE is_active = 1 ORDER BY sort_order, name').all());
};

export const POST: RequestHandler = async ({ request }) => {
	const data = await request.json();
	const db = getDb();
	const id = generateId();
	try {
		db.prepare(`INSERT INTO pcr_protocols (id, name, polymerase, annealing_temp_c, num_cycles, pcr_cond, sort_order)
			VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, data.name, data.polymerase ?? null,
			data.annealing_temp_c ?? null, data.num_cycles ?? null, data.pcr_cond ?? null, data.sort_order ?? 0);
		return json(db.prepare('SELECT * FROM pcr_protocols WHERE id = ?').get(id), { status: 201 });
	} catch (err) { return apiError(err); }
};
