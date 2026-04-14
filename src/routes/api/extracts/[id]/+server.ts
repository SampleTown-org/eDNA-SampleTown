import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { setEntityPersonnel, getEntityPersonnel, normalizePeople } from '$lib/server/entity-personnel';

const nn = (v: unknown): unknown => (typeof v === 'string' && v.trim() === '' ? null : v);

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const row = db.prepare('SELECT * FROM extracts WHERE id = ? AND is_deleted = 0').get(params.id);
	if (!row) throw error(404, 'Extract not found');
	const people = getEntityPersonnel('extract', params.id!);
	return json({ ...row, people });
};

export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const data = await request.json();
		if (!data?.extract_name?.trim()) {
			return json({ error: 'extract_name is required' }, { status: 400 });
		}
		const db = getDb();
		db.prepare(
			`UPDATE extracts SET
				extract_name = ?, extraction_date = ?, extraction_method = ?, nucl_acid_ext_kit = ?,
				nucl_acid_ext = ?, samp_taxon_id = ?, samp_vol_we_dna_ext = ?, pool_dna_extracts = ?,
				concentration_ng_ul = ?, total_volume_ul = ?, a260_280 = ?, a260_230 = ?,
				quantification_method = ?, storage_location = ?, storage_room = ?, storage_box = ?,
				notes = ?, custom_fields = ?,
				sync_version = sync_version + 1, updated_at = datetime('now')
			 WHERE id = ?`
		).run(
			data.extract_name.trim(),
			nn(data.extraction_date),
			nn(data.extraction_method),
			nn(data.nucl_acid_ext_kit),
			nn(data.nucl_acid_ext),
			nn(data.samp_taxon_id),
			nn(data.samp_vol_we_dna_ext),
			nn(data.pool_dna_extracts),
			data.concentration_ng_ul ?? null,
			data.total_volume_ul ?? null,
			data.a260_280 ?? null,
			data.a260_230 ?? null,
			nn(data.quantification_method),
			nn(data.storage_location),
			nn(data.storage_room),
			nn(data.storage_box),
			nn(data.notes),
			nn(data.custom_fields),
			params.id
		);
		if (data.people !== undefined) {
			setEntityPersonnel(db, 'extract', params.id!, normalizePeople(data.people));
		}
		const updated = db.prepare('SELECT * FROM extracts WHERE id = ?').get(params.id) as Record<string, unknown>;
		const people = getEntityPersonnel('extract', params.id!);
		return json({ ...updated, people });
	} catch (err) {
		return apiError(err);
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const db = getDb();
		db.prepare("UPDATE extracts SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?").run(
			params.id
		);
		return json({ ok: true });
	} catch (err) {
		return apiError(err);
	}
};
