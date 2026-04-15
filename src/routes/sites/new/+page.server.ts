import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';
import { getConstrainedValues } from '$lib/server/constrained-values';

export const load: PageServerLoad = async ({ url, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const projects = db
		.prepare('SELECT id, project_name FROM projects WHERE lab_id = ? ORDER BY project_name')
		.all(labId);
	const picklists = getConstrainedValues(
		labId,
		'geo_loc_name',
		'locality',
		'env_broad_scale',
		'env_local_scale'
	);
	return {
		projects,
		picklists,
		preselectedProjectId: url.searchParams.get('project_id') || '',
		scannedId: url.searchParams.get('id') || ''
	};
};
