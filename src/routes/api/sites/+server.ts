import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { parseLatLon } from '$lib/mixs/validators';

export const GET: RequestHandler = async ({ url }) => {
	const db = getDb();
	const projectId = url.searchParams.get('project_id');
	let query = 'SELECT * FROM sites WHERE is_deleted = 0';
	const params: string[] = [];
	if (projectId) { query += ' AND project_id = ?'; params.push(projectId); }
	query += ' ORDER BY site_name';
	return json(db.prepare(query).all(...params));
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const data = await request.json();
	const db = getDb();
	const id = generateId();
	const coords = parseLatLon(data.lat_lon || '');

	db.prepare(`
		INSERT INTO sites (id, project_id, site_name, description,
			lat_lon, latitude, longitude, geo_loc_name, locality,
			env_broad_scale, env_local_scale, env_medium,
			env_package, depth, elevation, habitat_type, access_notes,
			notes, custom_fields, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).run(id, data.project_id, data.site_name, data.description ?? null,
		data.lat_lon ?? null, coords?.latitude ?? null, coords?.longitude ?? null,
		data.geo_loc_name ?? null, data.locality ?? null,
		data.env_broad_scale ?? null, data.env_local_scale ?? null, data.env_medium ?? null,
		data.env_package ?? null, data.depth ?? null, data.elevation ?? null,
		data.habitat_type ?? null, data.access_notes ?? null,
		data.notes ?? null, data.custom_fields ?? null, locals.user?.id ?? null);
	return json(db.prepare('SELECT * FROM sites WHERE id = ?').get(id), { status: 201 });
};
