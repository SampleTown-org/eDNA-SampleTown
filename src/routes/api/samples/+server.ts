import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { setEntityPersonnel, normalizePeople } from '$lib/server/entity-personnel';

/** Coerce empty / missing strings to null. */
const nn = (v: unknown): unknown => (typeof v === 'string' && v.trim() === '' ? null : v);

/** MIxS missing-value sentinel for required fields the user hasn't filled in
 *  yet. The export pipeline round-trips these on output, so storing them in
 *  the DB stays semantically honest. */
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
				id, project_id, site_id, mixs_checklist, extension,
				samp_name, collection_date, env_medium,
				depth, elev,
				host_taxid, specific_host,
				temp, salinity, ph, diss_oxygen, pressure, turbidity, chlorophyll, nitrate, phosphate,
				samp_collect_device, samp_collect_method, samp_mat_process, samp_size,
				size_frac, source_mat_id,
				samp_store_sol, samp_store_temp, samp_store_dur, samp_store_loc, store_cond,
				ref_biomaterial, isol_growth_condt, tax_ident,
				filter_type, collector_name,
				notes, custom_fields, created_by
			) VALUES (
				?, ?, ?, ?, ?,
				?, ?, ?,
				?, ?,
				?, ?,
				?, ?, ?, ?, ?, ?, ?, ?, ?,
				?, ?, ?, ?,
				?, ?,
				?, ?, ?, ?, ?,
				?, ?, ?,
				?, ?,
				?, ?, ?
			)`
		).run(
			id,
			data.project_id,
			data.site_id,
			data.mixs_checklist || 'MimarksS',
			nn(data.extension),
			data.samp_name.trim(),
			orMissing(data.collection_date),
			orMissing(data.env_medium),
			nn(data.depth),
			nn(data.elev),
			nn(data.host_taxid),
			nn(data.specific_host),
			data.temp ?? null,
			data.salinity ?? null,
			data.ph ?? null,
			data.diss_oxygen ?? null,
			data.pressure ?? null,
			data.turbidity ?? null,
			data.chlorophyll ?? null,
			data.nitrate ?? null,
			data.phosphate ?? null,
			nn(data.samp_collect_device),
			nn(data.samp_collect_method),
			nn(data.samp_mat_process),
			nn(data.samp_size),
			nn(data.size_frac),
			nn(data.source_mat_id),
			nn(data.samp_store_sol),
			nn(data.samp_store_temp),
			nn(data.samp_store_dur),
			nn(data.samp_store_loc),
			nn(data.store_cond),
			nn(data.ref_biomaterial),
			nn(data.isol_growth_condt),
			nn(data.tax_ident),
			nn(data.filter_type),
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
