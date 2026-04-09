import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();
	const pcr = db.prepare(`SELECT p.*, e.extract_name, e.id as extract_id, s.samp_name, s.id as sample_id
		FROM pcr_amplifications p JOIN extracts e ON e.id = p.extract_id JOIN samples s ON s.id = e.sample_id
		WHERE p.id = ? AND p.is_deleted = 0`).get(params.pcrId);
	if (!pcr) throw error(404, 'PCR not found');
	const libraries = db.prepare('SELECT * FROM library_preps WHERE pcr_id = ? AND is_deleted = 0 ORDER BY created_at DESC').all(params.pcrId);
	return { pcr, libraries };
};
