import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';
import { getConstrainedValues } from '$lib/server/constrained-values';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();

	const site = db.prepare(`
		SELECT s.*, p.project_name
		FROM sites s
		JOIN projects p ON p.id = s.project_id
		WHERE s.id = ? AND s.is_deleted = 0 AND s.lab_id = ?
	`).get(params.siteId, labId);
	if (!site) throw error(404, 'Site not found');

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

	return { site, projects, picklists };
};
