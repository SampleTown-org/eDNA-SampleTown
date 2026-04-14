import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();

	const site = db.prepare(`
		SELECT s.*, p.project_name
		FROM sites s
		JOIN projects p ON p.id = s.project_id
		WHERE s.id = ? AND s.is_deleted = 0
	`).get(params.siteId);
	if (!site) throw error(404, 'Site not found');

	const samples = db.prepare(`
		SELECT s.*, p.project_name
		FROM samples s
		JOIN projects p ON p.id = s.project_id
		WHERE s.site_id = ? AND s.is_deleted = 0
		ORDER BY s.collection_date DESC
	`).all(params.siteId);

	const photos = db.prepare(`
		SELECT id, filename, original_filename, mime_type, size_bytes, caption, created_at
		FROM site_photos
		WHERE site_id = ? AND is_deleted = 0
		ORDER BY created_at DESC
	`).all(params.siteId);

	return { site, samples, photos };
};
