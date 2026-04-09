import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async ({ url }) => {
	const db = getDb();
	const projects = db.prepare('SELECT id, project_name FROM projects ORDER BY project_name').all();
	const preselectedProjectId = url.searchParams.get('project_id') || '';
	return { projects, preselectedProjectId };
};
