import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { requireLab } from '$lib/server/guards';

export const GET: RequestHandler = async ({ locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	return json(
		db
			.prepare('SELECT * FROM pcr_protocols WHERE lab_id = ? AND is_active = 1 ORDER BY sort_order, name')
			.all(labId)
	);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const { labId } = requireLab(locals);
	const data = await request.json();
	const db = getDb();
	const id = generateId();
	try {
		db.prepare(`INSERT INTO pcr_protocols (id, lab_id, name, polymerase, annealing_temp_c, num_cycles, pcr_cond, sort_order)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, labId, data.name, data.polymerase ?? null,
			data.annealing_temp_c ?? null, data.num_cycles ?? null, data.pcr_cond ?? null, data.sort_order ?? 0);
		return json(db.prepare('SELECT * FROM pcr_protocols WHERE id = ?').get(id), { status: 201 });
	} catch (err) { return apiError(err); }
};
