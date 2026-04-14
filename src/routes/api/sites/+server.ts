import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, resolveId } from '$lib/server/db';
import { parseLatLon } from '$lib/mixs/validators';
import { apiError } from '$lib/server/api-errors';

/** Coerce empty strings to null. SQLite CHECK constraints reject `''` for
 *  enum columns, and we want unselected dropdowns to land as NULL. */
const nn = (v: unknown): unknown => (typeof v === 'string' && v.trim() === '' ? null : v);

export const GET: RequestHandler = async ({ url }) => {
	const db = getDb();
	const projectId = url.searchParams.get('project_id');
	let query = 'SELECT * FROM sites WHERE is_deleted = 0';
	const params: string[] = [];
	if (projectId) {
		query += ' AND project_id = ?';
		params.push(projectId);
	}
	query += ' ORDER BY site_name';
	return json(db.prepare(query).all(...params));
};

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const data = await request.json();
		if (!data?.project_id) return json({ error: 'project_id is required' }, { status: 400 });
		if (!data?.site_name?.trim()) return json({ error: 'site_name is required' }, { status: 400 });

		const db = getDb();
		const id = resolveId(data?.id);
		const coords = parseLatLon(data.lat_lon || '');

		db.prepare(
			`INSERT INTO sites (id, project_id, site_name, description,
				lat_lon, latitude, longitude, geo_loc_name, locality,
				env_broad_scale, env_local_scale,
				access_notes,
				notes, custom_fields, created_by)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).run(
			id,
			data.project_id,
			data.site_name.trim(),
			nn(data.description),
			nn(data.lat_lon),
			coords?.latitude ?? data.latitude ?? null,
			coords?.longitude ?? data.longitude ?? null,
			nn(data.geo_loc_name),
			nn(data.locality),
			nn(data.env_broad_scale),
			nn(data.env_local_scale),
			nn(data.access_notes),
			nn(data.notes),
			nn(data.custom_fields),
			locals.user?.id ?? null
		);
		return json(db.prepare('SELECT * FROM sites WHERE id = ?').get(id), { status: 201 });
	} catch (err) {
		return apiError(err);
	}
};
