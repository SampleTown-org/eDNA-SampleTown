import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';

export const load: PageServerLoad = async ({ locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const sites = db.prepare(`
		SELECT s.*, p.project_name,
			(SELECT COUNT(*) FROM samples WHERE site_id = s.id AND is_deleted = 0) AS sample_count,
			(SELECT COUNT(*) FROM site_photos WHERE site_id = s.id AND is_deleted = 0) AS photo_count
		FROM sites s
		JOIN projects p ON p.id = s.project_id
		WHERE s.is_deleted = 0 AND s.lab_id = ?
		ORDER BY s.site_name
	`).all(labId);
	const projects = db
		.prepare('SELECT id, project_name FROM projects WHERE lab_id = ? ORDER BY project_name')
		.all(labId);
	return { sites, projects };
};
