import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, resolveId } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';
import { assertLabOwnsRow } from '$lib/server/lab-scope';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const pcrId = url.searchParams.get('pcr_id');
	const extractId = url.searchParams.get('extract_id');
	const plateId = url.searchParams.get('plate_id');
	let query = 'SELECT * FROM library_preps WHERE is_deleted = 0 AND lab_id = ?';
	const params: string[] = [labId];
	if (pcrId) { query += ' AND pcr_id = ?'; params.push(pcrId); }
	if (extractId) { query += ' AND extract_id = ?'; params.push(extractId); }
	if (plateId) { query += ' AND library_plate_id = ?'; params.push(plateId); }
	query += ' ORDER BY created_at DESC';
	return json(db.prepare(query).all(...params));
};

function insertLibrary(
	db: ReturnType<typeof getDb>,
	data: Record<string, unknown>,
	userId: string | null,
	labId: string
) {
	// library_preps can have any of three parents — validate whichever is
	// supplied against the caller's lab before inserting.
	if (data.pcr_id) {
		assertLabOwnsRow(db, 'pcr_amplifications', data.pcr_id as string, labId, 'PCR not found');
	}
	if (data.extract_id) {
		assertLabOwnsRow(db, 'extracts', data.extract_id as string, labId, 'Extract not found');
	}
	if (data.library_plate_id) {
		assertLabOwnsRow(db, 'library_plates', data.library_plate_id as string, labId, 'Library plate not found');
	}
	const id = resolveId(data?.id);
	db.prepare(`
		INSERT INTO library_preps (id, lab_id, pcr_id, extract_id, library_name, library_type, library_prep_kit,
			library_prep_date, platform, instrument_model, index_sequence_i7, index_sequence_i5,
			barcode, fragment_size_bp, final_concentration_ng_ul, notes, custom_fields, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).run(id, labId, data.pcr_id ?? null, data.extract_id ?? null, data.library_name, data.library_type,
		data.library_prep_kit ?? null, data.library_prep_date ?? null, data.platform ?? null,
		data.instrument_model ?? null, data.index_sequence_i7 ?? null, data.index_sequence_i5 ?? null,
		data.barcode ?? null, data.fragment_size_bp ?? null, data.final_concentration_ng_ul ?? null,
		data.notes ?? null, data.custom_fields ?? null, userId);
	return db.prepare('SELECT * FROM library_preps WHERE id = ?').get(id);
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, labId } = requireLab(locals);
	const data = await request.json();
	const db = getDb();

	if (Array.isArray(data)) {
		const insertMany = db.transaction((items: Record<string, unknown>[]) =>
			items.map(item => insertLibrary(db, item, user.id, labId))
		);
		return json(insertMany(data), { status: 201 });
	}

	return json(insertLibrary(db, data, user.id, labId), { status: 201 });
};
