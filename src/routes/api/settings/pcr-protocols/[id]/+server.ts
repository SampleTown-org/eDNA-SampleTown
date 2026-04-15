import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { requireLab } from '$lib/server/guards';
import { assertLabOwnsRow } from '$lib/server/lab-scope';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const { labId } = requireLab(locals);
	const data = await request.json();
	const db = getDb();
	try {
		assertLabOwnsRow(db, 'pcr_protocols', params.id!, labId, 'PCR protocol not found');
		db.prepare(`UPDATE pcr_protocols SET name = ?, polymerase = ?, annealing_temp_c = ?,
			num_cycles = ?, pcr_cond = ?, is_active = ?, sort_order = ? WHERE id = ?`).run(
			data.name, data.polymerase ?? null, data.annealing_temp_c ?? null,
			data.num_cycles ?? null, data.pcr_cond ?? null,
			data.is_active ?? 1, data.sort_order ?? 0, params.id);
		return json(db.prepare('SELECT * FROM pcr_protocols WHERE id = ?').get(params.id));
	} catch (err) { return apiError(err); }
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	assertLabOwnsRow(db, 'pcr_protocols', params.id!, labId, 'PCR protocol not found');
	db.prepare('DELETE FROM pcr_protocols WHERE id = ?').run(params.id);
	return json({ ok: true });
};
