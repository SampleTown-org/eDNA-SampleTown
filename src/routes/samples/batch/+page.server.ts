import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getConstrainedValues } from '$lib/server/constrained-values';
import { getActivePersonnel } from '$lib/server/personnel';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const projects = db.prepare('SELECT id, project_name FROM projects ORDER BY project_name').all();
	const personnel = getActivePersonnel();
	const picklists = getConstrainedValues('person_role');
	return { projects, personnel, picklists };
};
