import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';
import { getConstrainedValues } from '$lib/server/constrained-values';
import { getActivePersonnel } from '$lib/server/personnel';

export const load: PageServerLoad = async ({ url, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const extracts = db
		.prepare(
			`SELECT e.id, e.extract_name, s.samp_name FROM extracts e JOIN samples s ON s.id = e.sample_id WHERE e.is_deleted = 0 AND e.lab_id = ? ORDER BY e.extract_name`
		)
		.all(labId);
	const primerSets = db
		.prepare('SELECT * FROM primer_sets WHERE lab_id = ? AND is_active = 1 ORDER BY sort_order, name')
		.all(labId);
	const pcrProtocols = db
		.prepare('SELECT * FROM pcr_protocols WHERE lab_id = ? AND is_active = 1 ORDER BY sort_order, name')
		.all(labId);
	const personnel = getActivePersonnel(labId);
	const picklists = getConstrainedValues(labId, 'person_role');
	return { extracts, primerSets, pcrProtocols, personnel, picklists, preselectedExtractId: url.searchParams.get('extract_id') || '' };
};
