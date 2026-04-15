import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId, resolveId } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { requireLab } from '$lib/server/guards';
import { assertLabOwnsRow } from '$lib/server/lab-scope';
import { setEntityPersonnel, normalizePeople } from '$lib/server/entity-personnel';
import { parseBody } from '$lib/server/validation';
import { PcrPlateCreateBody } from '$lib/server/schemas/lab';

export const GET: RequestHandler = async ({ locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const plates = db.prepare(`
		SELECT p.*,
			(SELECT COUNT(*) FROM pcr_amplifications WHERE plate_id = p.id AND is_deleted = 0) AS reaction_count
		FROM pcr_plates p WHERE p.is_deleted = 0 AND p.lab_id = ? ORDER BY p.created_at DESC
	`).all(labId);
	return json(plates);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, labId } = requireLab(locals);
	const parsed = parseBody(PcrPlateCreateBody, await request.json().catch(() => null));
	if (!parsed.ok) return parsed.response;
	const data = parsed.data;

	const db = getDb();
	const plateId = resolveId((data as Record<string, unknown>)?.id);

	try {
		// Every referenced extract must belong to this lab before we create
		// anything — validate up front so we don't insert the plate header
		// and then bail mid-transaction.
		if (data.reactions && data.reactions.length > 0) {
			for (const r of data.reactions) {
				assertLabOwnsRow(db, 'extracts', r.extract_id, labId, 'Extract not found');
			}
		}

		// Create the plate
		db.prepare(`
			INSERT INTO pcr_plates (id, lab_id, plate_name, pcr_date, primer_set_id, target_subfragment,
				forward_primer_name, forward_primer_seq, reverse_primer_name, reverse_primer_seq,
				pcr_cond, annealing_temp_c, num_cycles, polymerase, nucl_acid_amp,
				notes, custom_fields, created_by)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(plateId, labId, data.plate_name, data.pcr_date ?? null, data.primer_set_id ?? null,
			data.target_subfragment ?? null, data.forward_primer_name ?? null, data.forward_primer_seq ?? null,
			data.reverse_primer_name ?? null, data.reverse_primer_seq ?? null,
			data.pcr_cond ?? null, data.annealing_temp_c ?? null, data.num_cycles ?? null,
			data.polymerase ?? null, data.nucl_acid_amp ?? null,
			data.notes ?? null, data.custom_fields ?? null, user.id);

		// Create individual reactions
		if (data.reactions && data.reactions.length > 0) {
			const insertReaction = db.prepare(`
				INSERT INTO pcr_amplifications (id, lab_id, plate_id, extract_id, pcr_name, well_label, primer_set_id, target_subfragment,
					forward_primer_name, forward_primer_seq, reverse_primer_name, reverse_primer_seq,
					pcr_cond, annealing_temp_c, num_cycles, polymerase, pcr_date,
					band_observed, concentration_ng_ul, notes, created_by)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`);
			const insertAll = db.transaction((reactions: typeof data.reactions) => {
				for (const r of reactions!) {
					insertReaction.run(generateId(), labId, plateId, r.extract_id, r.pcr_name, r.well_label ?? null,
						data.primer_set_id ?? null, data.target_subfragment ?? null,
						data.forward_primer_name ?? null, data.forward_primer_seq ?? null,
						data.reverse_primer_name ?? null, data.reverse_primer_seq ?? null,
						data.pcr_cond ?? null, data.annealing_temp_c ?? null, data.num_cycles ?? null,
						data.polymerase ?? null, data.pcr_date ?? null,
						r.band_observed ?? null, r.concentration_ng_ul ?? null, r.notes ?? null,
						user.id);
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
