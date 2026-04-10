import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { parseLatLon } from '$lib/mixs/validators';

export const GET: RequestHandler = async ({ url }) => {
	const db = getDb();
	const projectId = url.searchParams.get('project_id');

	let query = 'SELECT * FROM samples WHERE is_deleted = 0';
	const params: string[] = [];

	if (projectId) {
		query += ' AND project_id = ?';
		params.push(projectId);
	}

	query += ' ORDER BY created_at DESC';
	const samples = db.prepare(query).all(...params);
	return json(samples);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const data = await request.json();
	const db = getDb();
	const id = generateId();

	// Parse lat_lon to numeric values
	const coords = parseLatLon(data.lat_lon || '');

	db.prepare(`
		INSERT INTO samples (
			id, project_id, site_id, mixs_checklist,
			samp_name, collection_date, lat_lon, latitude, longitude,
			geo_loc_name, env_broad_scale, env_local_scale, env_medium, samp_taxon_id,
			env_package, depth, elevation, host_taxon_id,
			assembly_software, number_of_contigs, genome_coverage, reference_genome, annotation_source,
			temp, salinity, ph, dissolved_oxygen, pressure, turbidity, chlorophyll, nitrate, phosphate,
			sample_type, volume_filtered_ml, filter_type, preservation_method, storage_conditions, collector_name,
			notes, custom_fields, created_by
		) VALUES (
			?, ?, ?, ?,
			?, ?, ?, ?, ?,
			?, ?, ?, ?, ?,
			?, ?, ?, ?,
			?, ?, ?, ?, ?,
			?, ?, ?, ?, ?, ?, ?, ?, ?,
			?, ?, ?, ?, ?, ?,
			?, ?, ?
		)
	`).run(
		id, data.project_id, data.site_id ?? null, data.mixs_checklist || 'MIMARKS-SU',
		data.samp_name, data.collection_date, data.lat_lon, coords?.latitude ?? null, coords?.longitude ?? null,
		data.geo_loc_name, data.env_broad_scale, data.env_local_scale, data.env_medium, data.samp_taxon_id ?? null,
		data.env_package || 'water', data.depth ?? null, data.elevation ?? null, data.host_taxon_id ?? null,
		data.assembly_software ?? null, data.number_of_contigs ?? null, data.genome_coverage ?? null, data.reference_genome ?? null, data.annotation_source ?? null,
		data.temp ?? null, data.salinity ?? null, data.ph ?? null, data.dissolved_oxygen ?? null, data.pressure ?? null, data.turbidity ?? null, data.chlorophyll ?? null, data.nitrate ?? null, data.phosphate ?? null,
		data.sample_type ?? null, data.volume_filtered_ml ?? null, data.filter_type ?? null, data.preservation_method ?? null, data.storage_conditions ?? null, data.collector_name ?? null,
		data.notes ?? null, data.custom_fields ?? null, locals.user?.id ?? null
	);

	const sample = db.prepare('SELECT * FROM samples WHERE id = ?').get(id);
	return json(sample, { status: 201 });
};
