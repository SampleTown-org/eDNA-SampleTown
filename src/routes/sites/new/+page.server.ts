import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getConstrainedValues } from '$lib/server/constrained-values';

export const load: PageServerLoad = async ({ url }) => {
	const db = getDb();
	const projects = db.prepare('SELECT id, project_name FROM projects ORDER BY project_name').all();
	const picklists = getConstrainedValues('habitat_type', 'geo_loc_name', 'locality', 'env_broad_scale', 'env_local_scale', 'env_medium');
	return { projects, picklists, preselectedProjectId: url.searchParams.get('project_id') || '' };
};
