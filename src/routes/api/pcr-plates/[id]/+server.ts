import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { setEntityPersonnel, getEntityPersonnel, normalizePeople } from '$lib/server/entity-personnel';
import { parseBody } from '$lib/server/validation';
import { PcrPlateUpdateBody } from '$lib/server/schemas/lab';

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const plate = db.prepare('SELECT * FROM pcr_plates WHERE id = ? AND is_deleted = 0').get(params.id);
	if (!plate) throw error(404, 'PCR plate not found');
	const people = getEntityPersonnel('pcr_plate', params.id!);
	return json({ ...plate, people });
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const parsed = parseBody(PcrPlateUpdateBody, await request.json().catch(() => null));
	if (!parsed.ok) return parsed.response;
	const data = parsed.data;

	try {
		const db = getDb();
		db.prepare(
			`UPDATE pcr_plates SET
				plate_name = ?, pcr_date = ?, primer_set_id = ?, target_subfragment = ?,
				forward_primer_name = ?, forward_primer_seq = ?, reverse_primer_name = ?, reverse_primer_seq = ?,
				pcr_conditions = ?, annealing_temp_c = ?, num_cycles = ?, polymerase = ?,
				nucl_acid_amp = ?, notes = ?,
				sync_version = sync_version + 1, updated_at = datetime('now')
			 WHERE id = ?`
		).run(
			data.plate_name,
			data.pcr_date ?? null,
			data.primer_set_id ?? null,
			data.target_subfragment ?? null,
			data.forward_primer_name ?? null,
			data.forward_primer_seq ?? null,
			data.reverse_primer_name ?? null,
			data.reverse_primer_seq ?? null,
			data.pcr_conditions ?? null,
			data.annealing_temp_c ?? null,
			data.num_cycles ?? null,
			data.polymerase ?? null,
			data.nucl_acid_amp ?? null,
			data.notes ?? null,
			params.id
		);
		if (data.people !== undefined) {
			setEntityPersonnel(db, 'pcr_plate', params.id!, normalizePeople(data.people));
		}
		const updated = db.prepare('SELECT * FROM pcr_plates WHERE id = ?').get(params.id) as Record<string, unknown>;
		const people = getEntityPersonnel('pcr_plate', params.id!);
		return json({ ...updated, people });
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
