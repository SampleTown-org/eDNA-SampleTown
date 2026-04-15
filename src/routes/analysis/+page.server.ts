import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';

export const load: PageServerLoad = async ({ locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const analyses = db.prepare(`
		SELECT a.*, r.run_name
		FROM analyses a
		JOIN sequencing_runs r ON r.id = a.run_id
		WHERE a.lab_id = ?
		ORDER BY a.created_at DESC
	`).all(labId);
	return { analyses };
};
