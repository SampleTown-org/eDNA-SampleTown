import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getConstrainedValues } from '$lib/server/constrained-values';
import { getActivePersonnel } from '$lib/server/personnel';

export const load: PageServerLoad = async ({ url }) => {
	const db = getDb();
	const samples = db.prepare(`SELECT s.id, s.samp_name, p.project_name FROM samples s JOIN projects p ON p.id = s.project_id WHERE s.is_deleted = 0 ORDER BY s.samp_name`).all();
	const picklists = getConstrainedValues('extraction_method', 'storage_room', 'storage_box', 'person_role', 'samp_taxon_id');
	const personnel = getActivePersonnel();
	return { samples, picklists, personnel, preselectedSampleId: url.searchParams.get('sample_id') || '' };
};
