import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';

export const GET: RequestHandler = async ({ url }) => {
	const db = getDb();
	const pcrId = url.searchParams.get('pcr_id');
	const extractId = url.searchParams.get('extract_id');
	const plateId = url.searchParams.get('plate_id');
	let query = 'SELECT * FROM library_preps WHERE is_deleted = 0';
	const params: string[] = [];
	if (pcrId) { query += ' AND pcr_id = ?'; params.push(pcrId); }
	if (extractId) { query += ' AND extract_id = ?'; params.push(extractId); }
	if (plateId) { query += ' AND library_plate_id = ?'; params.push(plateId); }
	query += ' ORDER BY created_at DESC';
	return json(db.prepare(query).all(...params));
};

function insertLibrary(db: ReturnType<typeof getDb>, data: Record<string, unknown>, userId: string | null) {
	const id = generateId();
	db.prepare(`
		INSERT INTO library_preps (id, pcr_id, extract_id, library_name, library_type, library_prep_kit,
			library_prep_date, platform, instrument_model, index_sequence_i7, index_sequence_i5,
			barcode, fragment_size_bp, final_concentration_ng_ul, notes, custom_fields, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).run(id, data.pcr_id ?? null, data.extract_id ?? null, data.library_name, data.library_type,
		data.library_prep_kit ?? null, data.library_prep_date ?? null, data.platform ?? null,
		data.instrument_model ?? null, data.index_sequence_i7 ?? null, data.index_sequence_i5 ?? null,
		data.barcode ?? null, data.fragment_size_bp ?? null, data.final_concentration_ng_ul ?? null,
		data.notes ?? null, data.custom_fields ?? null, userId);
	return db.prepare('SELECT * FROM library_preps WHERE id = ?').get(id);
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const data = await request.json();
	const db = getDb();
	const userId = locals.user?.id ?? null;

	if (Array.isArray(data)) {
		const insertMany = db.transaction((items: Record<string, unknown>[]) =>
			items.map(item => insertLibrary(db, item, userId))
		);
		return json(insertMany(data), { status: 201 });
	}

	return json(insertLibrary(db, data, userId), { status: 201 });
};
