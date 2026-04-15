import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';
import { getConstrainedValues } from '$lib/server/constrained-values';
import { getActivePersonnel } from '$lib/server/personnel';

export const load: PageServerLoad = async ({ locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const projects = db
		.prepare('SELECT id, project_name FROM projects WHERE lab_id = ? ORDER BY project_name')
		.all(labId);
	const sampleCount = (db
		.prepare('SELECT COUNT(*) as c FROM samples WHERE is_deleted = 0 AND lab_id = ?')
		.get(labId) as { c: number }).c;
	const checklists = db
		.prepare(
			"SELECT DISTINCT mixs_checklist FROM samples WHERE is_deleted = 0 AND lab_id = ? ORDER BY mixs_checklist"
		)
		.all(labId) as { mixs_checklist: string }[];
	const personnel = getActivePersonnel(labId);
	const picklists = getConstrainedValues(labId, 'person_role');
	return { projects, sampleCount, checklists, personnel, picklists };
};
