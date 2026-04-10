import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();

	// Try as plate first
	const plate = db.prepare(`SELECT * FROM pcr_plates WHERE id = ? AND is_deleted = 0`).get(params.pcrId);
	if (plate) {
		const reactions = db.prepare(`
			SELECT r.*, e.extract_name, s.samp_name, s.id as sample_id
			FROM pcr_amplifications r
			JOIN extracts e ON e.id = r.extract_id
			JOIN samples s ON s.id = e.sample_id
			WHERE r.plate_id = ? AND r.is_deleted = 0
			ORDER BY r.pcr_name
		`).all(params.pcrId);

		const libraries = db.prepare(`
			SELECT l.* FROM library_preps l
			JOIN pcr_amplifications r ON r.id = l.pcr_id
			WHERE r.plate_id = ? AND l.is_deleted = 0
		`).all(params.pcrId);

		return { type: 'plate', plate, reactions, libraries };
	}

	// Fall back to individual reaction (backward compat)
	const pcr = db.prepare(`SELECT p.*, e.extract_name, e.id as extract_id, s.samp_name, s.id as sample_id
		FROM pcr_amplifications p JOIN extracts e ON e.id = p.extract_id JOIN samples s ON s.id = e.sample_id
		WHERE p.id = ? AND p.is_deleted = 0`).get(params.pcrId);
	if (!pcr) throw error(404, 'PCR plate or reaction not found');

	const libraries = db.prepare('SELECT * FROM library_preps WHERE pcr_id = ? AND is_deleted = 0 ORDER BY created_at DESC').all(params.pcrId);
	return { type: 'reaction', pcr, libraries };
};
