import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';
import { attachPeopleSummary } from '$lib/server/entity-personnel';

export const load: PageServerLoad = async ({ locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const extracts = db.prepare(`
		SELECT e.*, s.samp_name
		FROM extracts e
		JOIN samples s ON s.id = e.sample_id
		WHERE e.is_deleted = 0 AND e.lab_id = ?
		ORDER BY e.created_at DESC
	`).all(labId) as { id: string }[];
	return { extracts: attachPeopleSummary('extract', extracts) };
};
