import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getConstrainedValues } from '$lib/server/constrained-values';
import { getActivePersonnel } from '$lib/server/personnel';
import { getEntityPersonnel } from '$lib/server/entity-personnel';

export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();
	const extract = db.prepare('SELECT * FROM extracts WHERE id = ? AND is_deleted = 0').get(params.extractId);
	if (!extract) throw error(404, 'Extract not found');
	const picklists = getConstrainedValues('person_role');
	const personnel = getActivePersonnel();
	const people = getEntityPersonnel('extract', params.extractId).map((p) => ({
		personnel_id: p.personnel_id,
		role: p.role
	}));
	return { extract, picklists, personnel, people };
};
