import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();
	const pcr = db.prepare(`SELECT p.*, e.extract_name, e.id as extract_id, s.samp_name, s.id as sample_id,
		pl.plate_name, pl.id as plate_id, ps.target_gene
		FROM pcr_amplifications p
		JOIN extracts e ON e.id = p.extract_id
		JOIN samples s ON s.id = e.sample_id
		LEFT JOIN pcr_plates pl ON pl.id = p.plate_id
		LEFT JOIN primer_sets ps ON ps.id = p.primer_set_id
		WHERE p.id = ? AND p.is_deleted = 0`).get(params.reactionId);
	if (!pcr) throw error(404, 'PCR reaction not found');
	const libraries = db.prepare('SELECT * FROM library_preps WHERE pcr_id = ? AND is_deleted = 0 ORDER BY created_at DESC').all(params.reactionId);
	return { pcr, libraries };
};
