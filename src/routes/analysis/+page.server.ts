import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const analyses = db.prepare(`
		SELECT a.*, r.run_name
		FROM analyses a
		JOIN sequencing_runs r ON r.id = a.run_id
		ORDER BY a.created_at DESC
	`).all();
	return { analyses };
};
