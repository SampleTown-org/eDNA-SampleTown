import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async ({ url }) => {
	const db = getDb();
	const pcrs = db.prepare(`SELECT p.id, p.pcr_name, p.target_gene, e.extract_name FROM pcr_amplifications p JOIN extracts e ON e.id = p.extract_id WHERE p.is_deleted = 0 ORDER BY p.pcr_name`).all();
	const extracts = db.prepare(`SELECT e.id, e.extract_name, s.samp_name FROM extracts e JOIN samples s ON s.id = e.sample_id WHERE e.is_deleted = 0 ORDER BY e.extract_name`).all();
	return { pcrs, extracts, preselectedPcrId: url.searchParams.get('pcr_id') || '', preselectedExtractId: url.searchParams.get('extract_id') || '' };
};
