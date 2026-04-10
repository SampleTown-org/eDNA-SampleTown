import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { parseLatLon } from '$lib/mixs/validators';
import { apiError } from '$lib/server/api-errors';

/** Coerce empty / missing strings to null. */
const nn = (v: unknown): unknown => (typeof v === 'string' && v.trim() === '' ? null : v);

/** MIxS missing-value sentinel for required fields the user hasn't filled in
 *  yet. The export pipeline already round-trips these on output, so storing
 *  them in the DB stays semantically honest. */
const MIXS_MISSING = 'not collected';
const orMissing = (v: unknown): string => {
	const cleaned = nn(v);
	return typeof cleaned === 'string' && cleaned ? cleaned : MIXS_MISSING;
};

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
	try {
		const data = await request.json();

		// Only project_id and samp_name are user-required. Everything else
		// either has a sensible default or is filled with the MIxS
		// "not collected" sentinel so the NOT NULL constraints stay
		// satisfied without forcing the user to enter junk.
		if (!data?.project_id) return json({ error: 'project_id is required' }, { status: 400 });
		if (!data?.samp_name?.trim()) return json({ error: 'samp_name is required' }, { status: 400 });

		const db = getDb();
		const id = generateId();
		const coords = parseLatLon(data.lat_lon || '');

		db.prepare(
			`INSERT INTO samples (
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
			)`
		).run(
			id,
			data.project_id,
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
			data.env_package || 'water', // env_package has a CHECK constraint and a default
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
			locals.user?.id ?? null
		);

		const sample = db.prepare('SELECT * FROM samples WHERE id = ?').get(id);
		return json(sample, { status: 201 });
	} catch (err) {
		return apiError(err);
	}
};
