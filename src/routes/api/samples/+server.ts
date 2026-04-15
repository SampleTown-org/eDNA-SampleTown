import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, resolveId } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { requireLab } from '$lib/server/guards';
import { assertLabOwnsRow } from '$lib/server/lab-scope';
import { setEntityPersonnel, normalizePeople } from '$lib/server/entity-personnel';
import { splitSampleBody, insertSampleValues, loadSampleValues } from '$lib/server/sample-body';

/** Coerce empty / missing strings to null. */
const nn = (v: unknown): unknown => (typeof v === 'string' && v.trim() === '' ? null : v);

/** MIxS missing-value sentinel for required fields the user hasn't filled in yet. */
const MIXS_MISSING = 'not collected';
const orMissing = (v: unknown): string => {
	const cleaned = nn(v);
	return typeof cleaned === 'string' && cleaned ? cleaned : MIXS_MISSING;
};

export const GET: RequestHandler = async ({ url, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const projectId = url.searchParams.get('project_id');
	// lab_id filter on s. — site/project are also lab-scoped but we only
	// need one gate, and samples.lab_id was set at insert time from the
	// creator's lab_id.
	let query = `SELECT s.*, st.lat_lon, st.latitude, st.longitude, st.geo_loc_name,
		st.env_broad_scale, st.env_local_scale, st.site_name
		FROM samples s
		JOIN sites st ON st.id = s.site_id
		WHERE s.is_deleted = 0 AND s.lab_id = ?`;
	const params: string[] = [labId];
	if (projectId) { query += ' AND s.project_id = ?'; params.push(projectId); }
	query += ' ORDER BY s.created_at DESC';
	const samples = db.prepare(query).all(...params);
	return json(samples);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { user, labId } = requireLab(locals);
		const raw = await request.json();
		// Split out any non-column keys (MIxS slots without a column — silicate,
		// ammonium, etc. — plus misc_param:<tag> entries). They land in
		// sample_values, not a JSON blob.
		const { core: data, values } = splitSampleBody(raw);

		if (!data?.project_id) return json({ error: 'project_id is required' }, { status: 400 });
		if (!(data?.samp_name as string)?.trim?.()) return json({ error: 'samp_name is required' }, { status: 400 });
		if (!data?.site_id) return json({ error: 'site_id is required' }, { status: 400 });

		const db = getDb();
		// Cross-lab guards: the supplied project + site must both belong to
		// the caller's lab. 404 (not 403) so we don't confirm existence.
		assertLabOwnsRow(db, 'projects', data.project_id as string, labId, 'Project not found');
		assertLabOwnsRow(db, 'sites', data.site_id as string, labId, 'Site not found');
		const id = resolveId(raw?.id);

		db.prepare(
			`INSERT INTO samples (
				id, lab_id, project_id, site_id, mixs_checklist, extension,
				samp_name, collection_date, env_medium,
				depth, elev,
				host_taxid, specific_host,
				temp, salinity, ph, diss_oxygen, pressure, turbidity, chlorophyll, nitrate, phosphate,
				samp_collect_device, samp_collect_method, samp_mat_process, samp_size,
				size_frac, source_mat_id,
				samp_store_sol, samp_store_temp, samp_store_dur, samp_store_loc, store_cond,
				ref_biomaterial, isol_growth_condt, tax_ident,
				filter_type, collector_name,
				notes, created_by
			) VALUES (
				?, ?, ?, ?, ?, ?,
				?, ?, ?,
				?, ?,
				?, ?,
				?, ?, ?, ?, ?, ?, ?, ?, ?,
				?, ?, ?, ?,
				?, ?,
				?, ?, ?, ?, ?,
				?, ?, ?,
				?, ?,
				?, ?
			)`
		).run(
			id,
			labId,
			data.project_id,
			data.site_id,
			data.mixs_checklist || 'MimarksS',
			nn(data.extension),
			(data.samp_name as string).trim(),
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
			user.id
		);

		insertSampleValues(db, id, values);
		setEntityPersonnel(db, 'sample', id, normalizePeople(data.people));

		const sample = db.prepare('SELECT * FROM samples WHERE id = ?').get(id) as Record<string, unknown>;
		const vals = loadSampleValues(db, id);
		return json({ ...sample, ...vals }, { status: 201 });
	} catch (err) {
		return apiError(err);
	}
};
