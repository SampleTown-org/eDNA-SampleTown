import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';
import { getConstrainedValues } from '$lib/server/constrained-values';
import { getActivePersonnel } from '$lib/server/personnel';
import { getEntityPersonnel } from '$lib/server/entity-personnel';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const extract = db
		.prepare('SELECT * FROM extracts WHERE id = ? AND is_deleted = 0 AND lab_id = ?')
		.get(params.extractId, labId);
	if (!extract) throw error(404, 'Extract not found');
	const picklists = getConstrainedValues(
		labId,
		'extraction_method', 'storage_room', 'storage_box', 'person_role'
	);
	const personnel = getActivePersonnel(labId);
	const people = getEntityPersonnel('extract', params.extractId).map((p) => ({
		personnel_id: p.personnel_id,
		role: p.role
	}));
	return { extract, picklists, personnel, people };
};
