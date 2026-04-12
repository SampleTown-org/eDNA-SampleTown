import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { parseLatLon } from '$lib/mixs/validators';
import { apiError } from '$lib/server/api-errors';
import { setEntityPersonnel, getEntityPersonnel, normalizePeople } from '$lib/server/entity-personnel';

/** Coerce empty strings to null (CHECK constraints reject ''). */
const nn = (v: unknown): unknown => (typeof v === 'string' && v.trim() === '' ? null : v);

/** MIxS missing-value sentinel — same as the POST handler. */
const MIXS_MISSING = 'not collected';
const orMissing = (v: unknown): string => {
	const cleaned = nn(v);
	return typeof cleaned === 'string' && cleaned ? cleaned : MIXS_MISSING;
};

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const sample = db.prepare('SELECT * FROM samples WHERE id = ? AND is_deleted = 0').get(params.id);
	if (!sample) throw error(404, 'Sample not found');
	const people = getEntityPersonnel('sample', params.id!);
	return json({ ...sample, people });
};

export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const data = await request.json();
		const db = getDb();
		const existing = db.prepare('SELECT id FROM samples WHERE id = ? AND is_deleted = 0').get(params.id);
		if (!existing) throw error(404, 'Sample not found');

		if (!data?.samp_name?.trim()) {
			return json({ error: 'samp_name is required' }, { status: 400 });
		}

		const coords = data.lat_lon ? parseLatLon(data.lat_lon) : null;

		db.prepare(
			`UPDATE samples SET
				site_id = ?, mixs_checklist = ?, samp_name = ?, collection_date = ?,
				lat_lon = ?, latitude = ?, longitude = ?,
				geo_loc_name = ?, env_broad_scale = ?, env_local_scale = ?, env_medium = ?, samp_taxon_id = ?,
				env_package = ?, depth = ?, elevation = ?, host_taxon_id = ?,
				assembly_software = ?, number_of_contigs = ?, genome_coverage = ?, reference_genome = ?, annotation_source = ?,
				temp = ?, salinity = ?, ph = ?, dissolved_oxygen = ?, pressure = ?, turbidity = ?, chlorophyll = ?, nitrate = ?, phosphate = ?,
				sample_type = ?, volume_filtered_ml = ?, filter_type = ?, preservation_method = ?, storage_conditions = ?, collector_name = ?,
				notes = ?, custom_fields = ?,
				sync_version = sync_version + 1, updated_at = datetime('now')
			 WHERE id = ?`
		).run(
			nn(data.site_id),
			data.mixs_checklist || 'MIMARKS-SU',
			data.samp_name.trim(),
			orMissing(data.collection_date),
			orMissing(data.lat_lon),
			coords?.latitude ?? data.latitude ?? null,
			coords?.longitude ?? data.longitude ?? null,
			orMissing(data.geo_loc_name),
			orMissing(data.env_broad_scale),
			orMissing(data.env_local_scale),
			orMissing(data.env_medium),
			nn(data.samp_taxon_id),
			data.env_package || 'water',
			nn(data.depth),
			nn(data.elevation),
			nn(data.host_taxon_id),
			nn(data.assembly_software),
			data.number_of_contigs ?? null,
			nn(data.genome_coverage),
			nn(data.reference_genome),
			nn(data.annotation_source),
			data.temp ?? null,
			data.salinity ?? null,
			data.ph ?? null,
			data.dissolved_oxygen ?? null,
			data.pressure ?? null,
			data.turbidity ?? null,
			data.chlorophyll ?? null,
			data.nitrate ?? null,
			data.phosphate ?? null,
			nn(data.sample_type),
			data.volume_filtered_ml ?? null,
			nn(data.filter_type),
			nn(data.preservation_method),
			nn(data.storage_conditions),
			nn(data.collector_name),
			nn(data.notes),
			nn(data.custom_fields),
			params.id
		);

		// Replace the attributed people if the request supplied a list. We
		// only touch entity_personnel when `people` is explicitly present so
		// callers that update other fields don't accidentally clear it.
		if (data.people !== undefined) {
			setEntityPersonnel(db, 'sample', params.id!, normalizePeople(data.people));
		}

		const updated = db.prepare('SELECT * FROM samples WHERE id = ?').get(params.id) as Record<string, unknown>;
		const people = getEntityPersonnel('sample', params.id!);
		return json({ ...updated, people });
	} catch (err) {
		return apiError(err);
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const db = getDb();
		db.prepare("UPDATE samples SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?").run(
			params.id
		);
		return json({ ok: true });
	} catch (err) {
		return apiError(err);
	}
};
