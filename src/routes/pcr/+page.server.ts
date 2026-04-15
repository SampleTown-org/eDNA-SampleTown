import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';
import { attachPeopleSummary } from '$lib/server/entity-personnel';

export const load: PageServerLoad = async ({ locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const plates = db.prepare(`
		SELECT p.*, ps.target_gene,
			(SELECT COUNT(*) FROM pcr_amplifications WHERE plate_id = p.id AND is_deleted = 0) AS reaction_count,
			(SELECT GROUP_CONCAT(DISTINCT extract_id) FROM pcr_amplifications WHERE plate_id = p.id AND is_deleted = 0) AS extract_ids
		FROM pcr_plates p
		LEFT JOIN primer_sets ps ON ps.id = p.primer_set_id
		WHERE p.is_deleted = 0 AND p.lab_id = ? ORDER BY p.created_at DESC
	`).all(labId) as { id: string }[];

	// Orphan reactions (no plate)
	const orphanReactions = db.prepare(`
		SELECT r.*, e.extract_name, ps.target_gene
		FROM pcr_amplifications r
		JOIN extracts e ON e.id = r.extract_id
		LEFT JOIN primer_sets ps ON ps.id = r.primer_set_id
		WHERE r.plate_id IS NULL AND r.is_deleted = 0 AND r.lab_id = ?
		ORDER BY r.created_at DESC
	`).all(labId);

	return { plates: attachPeopleSummary('pcr_plate', plates), orphanReactions };
};
