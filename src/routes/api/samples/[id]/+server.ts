import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { setEntityPersonnel, getEntityPersonnel, normalizePeople } from '$lib/server/entity-personnel';
import { splitSampleBody, replaceSampleValues, loadSampleValues } from '$lib/server/sample-body';

/** Coerce empty strings to null (CHECK constraints reject ''). */
const nn = (v: unknown): unknown => (typeof v === 'string' && v.trim() === '' ? null : v);

const MIXS_MISSING = 'not collected';
const orMissing = (v: unknown): string => {
	const cleaned = nn(v);
	return typeof cleaned === 'string' && cleaned ? cleaned : MIXS_MISSING;
};

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const sample = db.prepare(`
		SELECT s.*, st.lat_lon, st.latitude, st.longitude, st.geo_loc_name,
			st.env_broad_scale, st.env_local_scale, st.site_name
		FROM samples s
		JOIN sites st ON st.id = s.site_id
		WHERE s.id = ? AND s.is_deleted = 0
	`).get(params.id) as Record<string, unknown> | undefined;
	if (!sample) throw error(404, 'Sample not found');
	const people = getEntityPersonnel('sample', params.id!);
	const values = loadSampleValues(db, params.id!);
	return json({ ...sample, ...values, people });
};

export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const raw = await request.json();
		const { core: data, values } = splitSampleBody(raw);
		const db = getDb();
		const existing = db.prepare('SELECT id FROM samples WHERE id = ? AND is_deleted = 0').get(params.id);
		if (!existing) throw error(404, 'Sample not found');

		if (!(data?.samp_name as string)?.trim?.()) {
			return json({ error: 'samp_name is required' }, { status: 400 });
		}
		if (!data?.site_id) {
			return json({ error: 'site_id is required' }, { status: 400 });
		}

		db.prepare(
			`UPDATE samples SET
				site_id = ?, mixs_checklist = ?, extension = ?, samp_name = ?, collection_date = ?,
				env_medium = ?,
				depth = ?, elev = ?,
				host_taxid = ?, specific_host = ?,
				temp = ?, salinity = ?, ph = ?, diss_oxygen = ?, pressure = ?, turbidity = ?, chlorophyll = ?, nitrate = ?, phosphate = ?,
				samp_collect_device = ?, samp_collect_method = ?, samp_mat_process = ?, samp_size = ?,
				size_frac = ?, source_mat_id = ?,
				samp_store_sol = ?, samp_store_temp = ?, samp_store_dur = ?, samp_store_loc = ?, store_cond = ?,
				ref_biomaterial = ?, isol_growth_condt = ?, tax_ident = ?,
				filter_type = ?, collector_name = ?,
				notes = ?,
				sync_version = sync_version + 1, updated_at = datetime('now')
			 WHERE id = ?`
		).run(
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
			params.id
		);

		// Reconcile sample_values: any slot not in `values` is deleted;
		// each entry in `values` is upserted.
		replaceSampleValues(db, params.id!, values);

		if (data.people !== undefined) {
			setEntityPersonnel(db, 'sample', params.id!, normalizePeople(data.people));
		}

		const updated = db.prepare('SELECT * FROM samples WHERE id = ?').get(params.id) as Record<string, unknown>;
		const people = getEntityPersonnel('sample', params.id!);
		const vals = loadSampleValues(db, params.id!);
		return json({ ...updated, ...vals, people });
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
