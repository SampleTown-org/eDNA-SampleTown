import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';
import { getConstrainedValues } from '$lib/server/constrained-values';
import { getActivePersonnel } from '$lib/server/personnel';

export const load: PageServerLoad = async ({ url, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const samples = db
		.prepare(
			`SELECT s.id, s.samp_name, p.project_name FROM samples s JOIN projects p ON p.id = s.project_id WHERE s.is_deleted = 0 AND s.lab_id = ? ORDER BY s.samp_name`
		)
		.all(labId);
	const picklists = getConstrainedValues(
		labId,
		'extraction_method',
		'storage_room',
		'storage_box',
		'person_role',
		'samp_taxon_id',
		'nucl_acid_type'
	);
	const personnel = getActivePersonnel(labId);
	return { samples, picklists, personnel, preselectedSampleId: url.searchParams.get('sample_id') || '' };
};
