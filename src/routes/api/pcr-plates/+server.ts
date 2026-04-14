import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { setEntityPersonnel, normalizePeople } from '$lib/server/entity-personnel';
import { parseBody } from '$lib/server/validation';
import { PcrPlateCreateBody } from '$lib/server/schemas/lab';

export const GET: RequestHandler = async () => {
	const db = getDb();
	const plates = db.prepare(`
		SELECT p.*,
			(SELECT COUNT(*) FROM pcr_amplifications WHERE plate_id = p.id AND is_deleted = 0) AS reaction_count
		FROM pcr_plates p WHERE p.is_deleted = 0 ORDER BY p.created_at DESC
	`).all();
	return json(plates);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const parsed = parseBody(PcrPlateCreateBody, await request.json().catch(() => null));
	if (!parsed.ok) return parsed.response;
	const data = parsed.data;

	const db = getDb();
	const plateId = generateId();

	try {
		// Create the plate
		db.prepare(`
			INSERT INTO pcr_plates (id, plate_name, pcr_date, primer_set_id, target_subfragment,
				forward_primer_name, forward_primer_seq, reverse_primer_name, reverse_primer_seq,
				pcr_cond, annealing_temp_c, num_cycles, polymerase, nucl_acid_amp,
				notes, custom_fields, created_by)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(plateId, data.plate_name, data.pcr_date ?? null, data.primer_set_id ?? null,
			data.target_subfragment ?? null, data.forward_primer_name ?? null, data.forward_primer_seq ?? null,
			data.reverse_primer_name ?? null, data.reverse_primer_seq ?? null,
			data.pcr_cond ?? null, data.annealing_temp_c ?? null, data.num_cycles ?? null,
			data.polymerase ?? null, data.nucl_acid_amp ?? null,
			data.notes ?? null, data.custom_fields ?? null, locals.user?.id ?? null);

		// Create individual reactions
		if (data.reactions && data.reactions.length > 0) {
			const insertReaction = db.prepare(`
				INSERT INTO pcr_amplifications (id, plate_id, extract_id, pcr_name, well_label, primer_set_id, target_subfragment,
					forward_primer_name, forward_primer_seq, reverse_primer_name, reverse_primer_seq,
					pcr_cond, annealing_temp_c, num_cycles, polymerase, pcr_date,
					band_observed, concentration_ng_ul, notes, created_by)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`);
			const insertAll = db.transaction((reactions: typeof data.reactions) => {
				for (const r of reactions!) {
					insertReaction.run(generateId(), plateId, r.extract_id, r.pcr_name, r.well_label ?? null,
						data.primer_set_id ?? null, data.target_subfragment ?? null,
						data.forward_primer_name ?? null, data.forward_primer_seq ?? null,
						data.reverse_primer_name ?? null, data.reverse_primer_seq ?? null,
						data.pcr_cond ?? null, data.annealing_temp_c ?? null, data.num_cycles ?? null,
						data.polymerase ?? null, data.pcr_date ?? null,
						r.band_observed ?? null, r.concentration_ng_ul ?? null, r.notes ?? null,
						locals.user?.id ?? null);
				}
			});
			insertAll(data.reactions);
		}

		setEntityPersonnel(db, 'pcr_plate', plateId, normalizePeople(data.people));

		const plate = db.prepare('SELECT * FROM pcr_plates WHERE id = ?').get(plateId);
		return json(plate, { status: 201 });
	} catch (err) {
		return apiError(err);
	}
};
