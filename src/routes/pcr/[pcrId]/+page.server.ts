import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';
import { getEntityPersonnel } from '$lib/server/entity-personnel';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();

	// Try as plate first (JOIN primer_sets for target_gene display)
	const plate = db.prepare(`
		SELECT p.*, ps.target_gene FROM pcr_plates p
		LEFT JOIN primer_sets ps ON ps.id = p.primer_set_id
		WHERE p.id = ? AND p.is_deleted = 0 AND p.lab_id = ?
	`).get(params.pcrId, labId);
	if (plate) {
		const reactions = db.prepare(`
			SELECT r.*, e.extract_name, s.samp_name, s.id as sample_id, ps.target_gene
			FROM pcr_amplifications r
			JOIN extracts e ON e.id = r.extract_id
			JOIN samples s ON s.id = e.sample_id
			LEFT JOIN primer_sets ps ON ps.id = r.primer_set_id
			WHERE r.plate_id = ? AND r.is_deleted = 0
			ORDER BY r.pcr_name
		`).all(params.pcrId);

		const libraries = db.prepare(`
			SELECT l.* FROM library_preps l
			JOIN pcr_amplifications r ON r.id = l.pcr_id
			WHERE r.plate_id = ? AND l.is_deleted = 0
		`).all(params.pcrId);

		const people = getEntityPersonnel('pcr_plate', params.pcrId);

		return { type: 'plate', plate, reactions, libraries, people };
	}

	// Fall back to individual reaction
	const pcr = db.prepare(`SELECT p.*, e.extract_name, e.id as extract_id, s.samp_name, s.id as sample_id,
			s.site_id, st.site_name, s.project_id, proj.project_name,
			ps.target_gene
		FROM pcr_amplifications p
		JOIN extracts e ON e.id = p.extract_id
		JOIN samples s ON s.id = e.sample_id
		JOIN sites st ON st.id = s.site_id
		JOIN projects proj ON proj.id = s.project_id
		LEFT JOIN primer_sets ps ON ps.id = p.primer_set_id
		WHERE p.id = ? AND p.is_deleted = 0 AND p.lab_id = ?`).get(params.pcrId, labId);
	if (!pcr) throw error(404, 'PCR plate or reaction not found');

	const libraries = db.prepare('SELECT * FROM library_preps WHERE pcr_id = ? AND is_deleted = 0 ORDER BY created_at DESC').all(params.pcrId);
	return { type: 'reaction', pcr, libraries };
};
