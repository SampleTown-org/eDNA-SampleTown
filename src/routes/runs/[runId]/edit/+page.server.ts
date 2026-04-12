import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getConstrainedValues } from '$lib/server/constrained-values';
import { getActivePersonnel } from '$lib/server/personnel';
import { getEntityPersonnel } from '$lib/server/entity-personnel';

export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();
	const run = db.prepare('SELECT * FROM sequencing_runs WHERE id = ? AND is_deleted = 0').get(params.runId);
	if (!run) throw error(404, 'Run not found');
	const picklists = getConstrainedValues('person_role');
	const personnel = getActivePersonnel();
	const people = getEntityPersonnel('sequencing_run', params.runId).map((p) => ({
		personnel_id: p.personnel_id,
		role: p.role
	}));
	return { run, picklists, personnel, people };
};
