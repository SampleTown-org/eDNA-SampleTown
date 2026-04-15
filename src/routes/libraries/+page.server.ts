import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';
import { attachPeopleSummary } from '$lib/server/entity-personnel';

export const load: PageServerLoad = async ({ locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const plates = db.prepare(`
		SELECT p.*,
			(SELECT COUNT(*) FROM library_preps WHERE library_plate_id = p.id AND is_deleted = 0) AS library_count,
			pp.plate_name AS pcr_plate_name,
			(SELECT GROUP_CONCAT(DISTINCT l.pcr_id) FROM library_preps l WHERE l.library_plate_id = p.id AND l.pcr_id IS NOT NULL AND l.is_deleted = 0) AS pcr_ids,
			(SELECT GROUP_CONCAT(DISTINCT l.extract_id) FROM library_preps l WHERE l.library_plate_id = p.id AND l.extract_id IS NOT NULL AND l.is_deleted = 0) AS extract_ids
		FROM library_plates p
		LEFT JOIN pcr_plates pp ON pp.id = p.pcr_plate_id
		WHERE p.is_deleted = 0 AND p.lab_id = ? ORDER BY p.created_at DESC
	`).all(labId) as { id: string }[];

	const orphanLibraries = db.prepare(`
		SELECT * FROM library_preps WHERE library_plate_id IS NULL AND is_deleted = 0 AND lab_id = ? ORDER BY created_at DESC
	`).all(labId);

	return { plates: attachPeopleSummary('library_plate', plates), orphanLibraries };
};
