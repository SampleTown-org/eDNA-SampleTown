import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId, resolveId } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { requireLab } from '$lib/server/guards';
import { assertLabOwnsRow } from '$lib/server/lab-scope';
import { setEntityPersonnel, normalizePeople } from '$lib/server/entity-personnel';
import { parseBody } from '$lib/server/validation';
import { LibraryPlateCreateBody } from '$lib/server/schemas/lab';

export const GET: RequestHandler = async ({ locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const plates = db.prepare(`
		SELECT p.*,
			(SELECT COUNT(*) FROM library_preps WHERE library_plate_id = p.id AND is_deleted = 0) AS library_count
		FROM library_plates p WHERE p.is_deleted = 0 AND p.lab_id = ? ORDER BY p.created_at DESC
	`).all(labId);
	return json(plates);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, labId } = requireLab(locals);
	const parsed = parseBody(LibraryPlateCreateBody, await request.json().catch(() => null));
	if (!parsed.ok) return parsed.response;
	const data = parsed.data;

	const db = getDb();
	const plateId = resolveId((data as Record<string, unknown>)?.id);

	try {
		// Validate every referenced parent row (pcr_plate + each library row's
		// pcr/extract) is in this lab before we insert anything.
		if (data.pcr_plate_id) {
			assertLabOwnsRow(db, 'pcr_plates', data.pcr_plate_id, labId, 'PCR plate not found');
		}
		if (data.libraries && data.libraries.length > 0) {
			for (const l of data.libraries) {
				if (l.pcr_id) {
					assertLabOwnsRow(db, 'pcr_amplifications', l.pcr_id, labId, 'PCR not found');
				}
				if (l.extract_id) {
					assertLabOwnsRow(db, 'extracts', l.extract_id, labId, 'Extract not found');
				}
			}
		}

		db.prepare(`
			INSERT INTO library_plates (id, lab_id, plate_name, library_prep_date, library_type,
				library_source, library_selection, library_prep_kit,
				platform, instrument_model, fragment_size_bp, pcr_plate_id, notes, custom_fields, created_by)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`).run(plateId, labId, data.plate_name, data.library_prep_date ?? null, data.library_type,
			data.library_source ?? null, data.library_selection ?? null,
			data.library_prep_kit ?? null, data.platform ?? null, data.instrument_model ?? null,
			data.fragment_size_bp ?? null, data.pcr_plate_id ?? null,
			data.notes ?? null, data.custom_fields ?? null, user.id);

		if (data.libraries && data.libraries.length > 0) {
			const insert = db.prepare(`
				INSERT INTO library_preps (id, lab_id, library_plate_id, pcr_id, extract_id, library_name, well_label, library_type,
					library_source, library_selection,
					library_prep_kit, library_prep_date, platform, instrument_model,
					index_sequence_i7, index_sequence_i5, barcode, fragment_size_bp,
					final_concentration_ng_ul, notes, created_by)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`);
			const insertAll = db.transaction((libs: typeof data.libraries) => {
				for (const l of libs!) {
					insert.run(generateId(), labId, plateId, l.pcr_id ?? null, l.extract_id ?? null,
						l.library_name, l.well_label ?? null, data.library_type,
						data.library_source ?? null, data.library_selection ?? null,
						data.library_prep_kit ?? null, data.library_prep_date ?? null,
						data.platform ?? null, data.instrument_model ?? null,
						l.index_sequence_i7 ?? null, l.index_sequence_i5 ?? null,
						l.barcode ?? null, data.fragment_size_bp ?? null,
						l.final_concentration_ng_ul ?? null, l.notes ?? null,
						user.id);
				}
			});
			insertAll(data.libraries);
		}

		setEntityPersonnel(db, 'library_plate', plateId, normalizePeople(data.people));

		const plate = db.prepare('SELECT * FROM library_plates WHERE id = ?').get(plateId);
		return json(plate, { status: 201 });
	} catch (err) {
		return apiError(err);
	}
};
