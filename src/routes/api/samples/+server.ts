import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { setEntityPersonnel, normalizePeople } from '$lib/server/entity-personnel';

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

	let query = `SELECT s.*, st.lat_lon, st.latitude, st.longitude, st.geo_loc_name,
		st.env_broad_scale, st.env_local_scale, st.site_name
		FROM samples s
		JOIN sites st ON st.id = s.site_id
		WHERE s.is_deleted = 0`;
	const params: string[] = [];

	if (projectId) {
		query += ' AND s.project_id = ?';
		params.push(projectId);
	}

	query += ' ORDER BY s.created_at DESC';
	const samples = db.prepare(query).all(...params);
	return json(samples);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const data = await request.json();

		if (!data?.project_id) return json({ error: 'project_id is required' }, { status: 400 });
		if (!data?.samp_name?.trim()) return json({ error: 'samp_name is required' }, { status: 400 });
		if (!data?.site_id) return json({ error: 'site_id is required' }, { status: 400 });

		const db = getDb();
		const id = generateId();

		db.prepare(
			`INSERT INTO samples (
				id, project_id, site_id, mixs_checklist,
				samp_name, collection_date, env_medium, samp_taxon_id,
				depth, elevation, host_taxon_id,
				assembly_software, number_of_contigs, genome_coverage, reference_genome, annotation_source,
				temp, salinity, ph, dissolved_oxygen, pressure, turbidity, chlorophyll, nitrate, phosphate,
				sample_type, volume_filtered_ml, filter_type, preservation_method, storage_conditions, collector_name,
				notes, custom_fields, created_by
			) VALUES (
				?, ?, ?, ?,
				?, ?, ?, ?,
				?, ?, ?,
				?, ?, ?, ?, ?,
				?, ?, ?, ?, ?, ?, ?, ?, ?,
				?, ?, ?, ?, ?, ?,
				?, ?, ?
			)`
		).run(
			id,
			data.project_id,
			data.site_id,
			data.mixs_checklist || 'MIMARKS-SU',
			data.samp_name.trim(),
			orMissing(data.collection_date),
			orMissing(data.env_medium),
			nn(data.samp_taxon_id),
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

		setEntityPersonnel(db, 'sample', id, normalizePeople(data.people));

		const sample = db.prepare('SELECT * FROM samples WHERE id = ?').get(id);
		return json(sample, { status: 201 });
	} catch (err) {
		return apiError(err);
	}
};
