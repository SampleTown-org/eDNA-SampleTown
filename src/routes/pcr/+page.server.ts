import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { attachPeopleSummary } from '$lib/server/entity-personnel';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const plates = db.prepare(`
		SELECT p.*,
			(SELECT COUNT(*) FROM pcr_amplifications WHERE plate_id = p.id AND is_deleted = 0) AS reaction_count
		FROM pcr_plates p WHERE p.is_deleted = 0 ORDER BY p.created_at DESC
	`).all() as { id: string }[];

	// Also show any orphan reactions (no plate) for backward compat
	const orphanReactions = db.prepare(`
		SELECT r.*, e.extract_name
		FROM pcr_amplifications r
		JOIN extracts e ON e.id = r.extract_id
		WHERE r.plate_id IS NULL AND r.is_deleted = 0
		ORDER BY r.created_at DESC
	`).all();

	return { plates: attachPeopleSummary('pcr_plate', plates), orphanReactions };
};
