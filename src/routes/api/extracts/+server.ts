import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { setEntityPersonnel, normalizePeople } from '$lib/server/entity-personnel';

export const GET: RequestHandler = async ({ url }) => {
	const db = getDb();
	const sampleId = url.searchParams.get('sample_id');
	let query = 'SELECT * FROM extracts WHERE is_deleted = 0';
	const params: string[] = [];
	if (sampleId) { query += ' AND sample_id = ?'; params.push(sampleId); }
	query += ' ORDER BY created_at DESC';
	return json(db.prepare(query).all(...params));
};

function insertExtract(db: ReturnType<typeof getDb>, data: Record<string, unknown>, userId: string | null) {
	const id = generateId();
	db.prepare(`
		INSERT INTO extracts (id, sample_id, extract_name, extraction_date, extraction_method, extraction_kit,
			concentration_ng_ul, total_volume_ul, a260_280, a260_230, quantification_method,
			storage_location, storage_room, storage_box, notes, custom_fields, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).run(id, data.sample_id, data.extract_name, data.extraction_date ?? null, data.extraction_method ?? null,
		data.extraction_kit ?? null, data.concentration_ng_ul ?? null, data.total_volume_ul ?? null,
		data.a260_280 ?? null, data.a260_230 ?? null, data.quantification_method ?? null,
		data.storage_location ?? null, data.storage_room ?? null, data.storage_box ?? null,
		data.notes ?? null, data.custom_fields ?? null, userId);
	setEntityPersonnel(db, 'extract', id, normalizePeople(data.people));
	return db.prepare('SELECT * FROM extracts WHERE id = ?').get(id);
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const data = await request.json();
	const db = getDb();
	const userId = locals.user?.id ?? null;

	if (Array.isArray(data)) {
		const insertMany = db.transaction((items: Record<string, unknown>[]) =>
			items.map(item => insertExtract(db, item, userId))
		);
		return json(insertMany(data), { status: 201 });
	}

	return json(insertExtract(db, data, userId), { status: 201 });
};
