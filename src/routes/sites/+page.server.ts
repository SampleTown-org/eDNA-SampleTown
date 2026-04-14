import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const sites = db.prepare(`
		SELECT s.*, p.project_name,
			(SELECT COUNT(*) FROM samples WHERE site_id = s.id AND is_deleted = 0) AS sample_count,
			(SELECT COUNT(*) FROM site_photos WHERE site_id = s.id AND is_deleted = 0) AS photo_count
		FROM sites s
		JOIN projects p ON p.id = s.project_id
		WHERE s.is_deleted = 0
		ORDER BY s.site_name
	`).all();
	const projects = db.prepare('SELECT id, project_name FROM projects ORDER BY project_name').all();
	return { sites, projects };
};
