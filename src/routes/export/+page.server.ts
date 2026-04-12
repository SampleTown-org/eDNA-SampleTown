import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getConstrainedValues } from '$lib/server/constrained-values';
import { getActivePersonnel } from '$lib/server/personnel';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const projects = db.prepare('SELECT id, project_name FROM projects ORDER BY project_name').all();
	const sampleCount = (db.prepare('SELECT COUNT(*) as c FROM samples WHERE is_deleted = 0').get() as { c: number }).c;
	const checklists = db.prepare("SELECT DISTINCT mixs_checklist FROM samples WHERE is_deleted = 0 ORDER BY mixs_checklist").all() as { mixs_checklist: string }[];
	const personnel = getActivePersonnel();
	const picklists = getConstrainedValues('person_role');
	return { projects, sampleCount, checklists, personnel, picklists };
};
