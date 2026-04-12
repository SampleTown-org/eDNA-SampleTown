import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getConstrainedValues } from '$lib/server/constrained-values';
import { getActivePersonnel } from '$lib/server/personnel';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const projects = db.prepare('SELECT id, project_name FROM projects ORDER BY project_name').all();
	const sites = db.prepare(`
		SELECT id, site_name, project_id FROM sites WHERE is_deleted = 0 ORDER BY site_name
	`).all();
	const personnel = getActivePersonnel();
	const picklists = getConstrainedValues('person_role');
	return { projects, sites, personnel, picklists };
};
