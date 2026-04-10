import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { parseLatLon } from '$lib/mixs/validators';

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const site = db.prepare('SELECT * FROM sites WHERE id = ? AND is_deleted = 0').get(params.id);
	if (!site) throw error(404, 'Site not found');
	return json(site);
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const data = await request.json();
	const db = getDb();
	const coords = parseLatLon(data.lat_lon || '');

	db.prepare(`
		UPDATE sites SET site_name = ?, description = ?,
			lat_lon = ?, latitude = ?, longitude = ?, geo_loc_name = ?, locality = ?,
			env_broad_scale = ?, env_local_scale = ?, env_medium = ?,
			env_package = ?, depth = ?, elevation = ?, habitat_type = ?, access_notes = ?,
			notes = ?, updated_at = datetime('now')
		WHERE id = ?
	`).run(data.site_name, data.description ?? null,
		data.lat_lon ?? null, coords?.latitude ?? null, coords?.longitude ?? null,
		data.geo_loc_name ?? null, data.locality ?? null,
		data.env_broad_scale ?? null, data.env_local_scale ?? null, data.env_medium ?? null,
		data.env_package ?? null, data.depth ?? null, data.elevation ?? null,
		data.habitat_type ?? null, data.access_notes ?? null,
		data.notes ?? null, params.id);
	return json(db.prepare('SELECT * FROM sites WHERE id = ?').get(params.id));
};

export const DELETE: RequestHandler = async ({ params }) => {
	const db = getDb();
	db.prepare("UPDATE sites SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?").run(params.id);
	return json({ ok: true });
};
