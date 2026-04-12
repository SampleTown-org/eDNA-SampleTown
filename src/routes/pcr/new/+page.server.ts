import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getConstrainedValues } from '$lib/server/constrained-values';
import { getActivePersonnel } from '$lib/server/personnel';

export const load: PageServerLoad = async ({ url }) => {
	const db = getDb();
	const extracts = db.prepare(`SELECT e.id, e.extract_name, s.samp_name FROM extracts e JOIN samples s ON s.id = e.sample_id WHERE e.is_deleted = 0 ORDER BY e.extract_name`).all();
	const primerSets = db.prepare('SELECT * FROM primer_sets WHERE is_active = 1 ORDER BY sort_order, name').all();
	const pcrProtocols = db.prepare('SELECT * FROM pcr_protocols WHERE is_active = 1 ORDER BY sort_order, name').all();
	const personnel = getActivePersonnel();
	const picklists = getConstrainedValues('person_role');
	return { extracts, primerSets, pcrProtocols, personnel, picklists, preselectedExtractId: url.searchParams.get('extract_id') || '' };
};
