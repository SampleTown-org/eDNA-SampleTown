import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async ({ url }) => {
	const db = getDb();
	const extracts = db.prepare(`SELECT e.id, e.extract_name, s.samp_name FROM extracts e JOIN samples s ON s.id = e.sample_id WHERE e.is_deleted = 0 ORDER BY e.extract_name`).all();
	return { extracts, preselectedExtractId: url.searchParams.get('extract_id') || '' };
};
