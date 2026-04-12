import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { parseLatLon } from '$lib/mixs/validators';
import { apiError } from '$lib/server/api-errors';

/** Coerce empty strings to null (CHECK constraints on enum cols reject ''). */
const nn = (v: unknown): unknown => (typeof v === 'string' && v.trim() === '' ? null : v);

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const site = db.prepare('SELECT * FROM sites WHERE id = ? AND is_deleted = 0').get(params.id);
	if (!site) throw error(404, 'Site not found');
	return json(site);
};

export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const data = await request.json();
		if (!data?.site_name?.trim()) {
			return json({ error: 'site_name is required' }, { status: 400 });
		}
		const db = getDb();
		const coords = parseLatLon(data.lat_lon || '');

		db.prepare(
			`UPDATE sites SET
				site_name = ?, description = ?,
				lat_lon = ?, latitude = ?, longitude = ?,
				geo_loc_name = ?, locality = ?,
				env_broad_scale = ?, env_local_scale = ?,
				habitat_type = ?, access_notes = ?,
				notes = ?, updated_at = datetime('now')
			 WHERE id = ?`
		).run(
			data.site_name.trim(),
			nn(data.description),
			nn(data.lat_lon),
			coords?.latitude ?? data.latitude ?? null,
			coords?.longitude ?? data.longitude ?? null,
			nn(data.geo_loc_name),
			nn(data.locality),
			nn(data.env_broad_scale),
			nn(data.env_local_scale),
			nn(data.habitat_type),
			nn(data.access_notes),
			nn(data.notes),
			params.id
		);
		return json(db.prepare('SELECT * FROM sites WHERE id = ?').get(params.id));
	} catch (err) {
		return apiError(err);
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const db = getDb();
		db.prepare("UPDATE sites SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?").run(
			params.id
		);
		return json({ ok: true });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (msg.includes('FOREIGN KEY constraint failed')) {
			return json({ error: 'Cannot delete site with existing samples. Reassign or delete the samples first.' }, { status: 409 });
		}
		return apiError(err);
	}
};
