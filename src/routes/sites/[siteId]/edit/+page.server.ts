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

	const projects = db.prepare('SELECT id, project_name FROM projects ORDER BY project_name').all();

	return { site, projects };
};
