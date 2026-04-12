import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();
	const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(params.projectId);
	if (!project) throw error(404, 'Project not found');

	const samples = db.prepare(`
		SELECT s.*, st.site_name
		FROM samples s
		JOIN sites st ON st.id = s.site_id
		WHERE s.project_id = ? AND s.is_deleted = 0
		ORDER BY s.created_at DESC
	`).all(params.projectId);

	return { project, samples };
};
