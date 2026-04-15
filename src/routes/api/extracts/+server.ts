import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, resolveId } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';
import { assertLabOwnsRow } from '$lib/server/lab-scope';
import { setEntityPersonnel, normalizePeople } from '$lib/server/entity-personnel';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const sampleId = url.searchParams.get('sample_id');
	let query = 'SELECT * FROM extracts WHERE is_deleted = 0 AND lab_id = ?';
	const params: string[] = [labId];
	if (sampleId) { query += ' AND sample_id = ?'; params.push(sampleId); }
	query += ' ORDER BY created_at DESC';
	return json(db.prepare(query).all(...params));
};

function insertExtract(
	db: ReturnType<typeof getDb>,
	data: Record<string, unknown>,
	userId: string | null,
	labId: string
) {
	// Parent sample must belong to this lab.
	assertLabOwnsRow(db, 'samples', data.sample_id as string, labId, 'Sample not found');
	const id = resolveId(data?.id);
	db.prepare(`
		INSERT INTO extracts (id, lab_id, sample_id, extract_name, extraction_date, extraction_method, nucl_acid_type, nucl_acid_ext_kit,
			nucl_acid_ext, samp_taxon_id, samp_vol_we_dna_ext, pool_dna_extracts,
			concentration_ng_ul, total_volume_ul, a260_280, a260_230, quantification_method,
			storage_location, storage_room, storage_box, notes, custom_fields, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).run(id, labId, data.sample_id, data.extract_name, data.extraction_date ?? null, data.extraction_method ?? null,
		data.nucl_acid_type ?? null, data.nucl_acid_ext_kit ?? null, data.nucl_acid_ext ?? null,
		data.samp_taxon_id ?? null, data.samp_vol_we_dna_ext ?? null, data.pool_dna_extracts ?? null,
		data.concentration_ng_ul ?? null, data.total_volume_ul ?? null,
		data.a260_280 ?? null, data.a260_230 ?? null, data.quantification_method ?? null,
		data.storage_location ?? null, data.storage_room ?? null, data.storage_box ?? null,
		data.notes ?? null, data.custom_fields ?? null, userId);
	setEntityPersonnel(db, 'extract', id, normalizePeople(data.people));
	return db.prepare('SELECT * FROM extracts WHERE id = ?').get(id);
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, labId } = requireLab(locals);
	const data = await request.json();
	const db = getDb();

	if (Array.isArray(data)) {
		const insertMany = db.transaction((items: Record<string, unknown>[]) =>
			items.map(item => insertExtract(db, item, user.id, labId))
		);
		return json(insertMany(data), { status: 201 });
	}

	return json(insertExtract(db, data, user.id, labId), { status: 201 });
};
