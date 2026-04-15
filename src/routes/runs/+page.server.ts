import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';
import { attachPeopleSummary } from '$lib/server/entity-personnel';

export const load: PageServerLoad = async ({ locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const runs = db.prepare(`
		SELECT r.*,
			(SELECT GROUP_CONCAT(DISTINCT rl.library_id) FROM run_libraries rl WHERE rl.run_id = r.id) AS library_ids,
			(SELECT GROUP_CONCAT(DISTINCT l.library_plate_id) FROM run_libraries rl JOIN library_preps l ON l.id = rl.library_id WHERE rl.run_id = r.id AND l.library_plate_id IS NOT NULL) AS library_plate_ids
		FROM sequencing_runs r WHERE r.is_deleted = 0 AND r.lab_id = ? ORDER BY r.created_at DESC
	`).all(labId) as { id: string }[];
	return { runs: attachPeopleSummary('sequencing_run', runs) };
};
