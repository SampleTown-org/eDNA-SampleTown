import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { parseLatLon } from '$lib/mixs/validators';

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const sample = db.prepare('SELECT * FROM samples WHERE id = ? AND is_deleted = 0').get(params.id);
	if (!sample) throw error(404, 'Sample not found');
	return json(sample);
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const data = await request.json();
	const db = getDb();

	const existing = db.prepare('SELECT * FROM samples WHERE id = ? AND is_deleted = 0').get(params.id);
	if (!existing) throw error(404, 'Sample not found');

	const coords = data.lat_lon ? parseLatLon(data.lat_lon) : null;

	db.prepare(`
		UPDATE samples SET
			site_id = ?, mixs_checklist = ?, samp_name = ?, collection_date = ?,
			lat_lon = ?, latitude = ?, longitude = ?,
			geo_loc_name = ?, env_broad_scale = ?, env_local_scale = ?, env_medium = ?, samp_taxon_id = ?,
			env_package = ?, depth = ?, elevation = ?, host_taxon_id = ?,
			assembly_software = ?, number_of_contigs = ?, genome_coverage = ?, reference_genome = ?, annotation_source = ?,
			temp = ?, salinity = ?, ph = ?, dissolved_oxygen = ?, pressure = ?, turbidity = ?, chlorophyll = ?, nitrate = ?, phosphate = ?,
			sample_type = ?, volume_filtered_ml = ?, filter_type = ?, preservation_method = ?, storage_conditions = ?, collector_name = ?,
			notes = ?, custom_fields = ?,
			sync_version = sync_version + 1, updated_at = datetime('now')
		WHERE id = ?
	`).run(
		data.site_id ?? null, data.mixs_checklist, data.samp_name, data.collection_date,
		data.lat_lon, coords?.latitude ?? null, coords?.longitude ?? null,
		data.geo_loc_name, data.env_broad_scale, data.env_local_scale, data.env_medium, data.samp_taxon_id ?? null,
		data.env_package, data.depth ?? null, data.elevation ?? null, data.host_taxon_id ?? null,
		data.assembly_software ?? null, data.number_of_contigs ?? null, data.genome_coverage ?? null, data.reference_genome ?? null, data.annotation_source ?? null,
		data.temp ?? null, data.salinity ?? null, data.ph ?? null, data.dissolved_oxygen ?? null, data.pressure ?? null, data.turbidity ?? null, data.chlorophyll ?? null, data.nitrate ?? null, data.phosphate ?? null,
		data.sample_type ?? null, data.volume_filtered_ml ?? null, data.filter_type ?? null, data.preservation_method ?? null, data.storage_conditions ?? null, data.collector_name ?? null,
		data.notes ?? null, data.custom_fields ?? null,
		params.id
	);

	const updated = db.prepare('SELECT * FROM samples WHERE id = ?').get(params.id);
	return json(updated);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const db = getDb();
	db.prepare('UPDATE samples SET is_deleted = 1, updated_at = datetime(\'now\') WHERE id = ?').run(params.id);
	return json({ ok: true });
};
