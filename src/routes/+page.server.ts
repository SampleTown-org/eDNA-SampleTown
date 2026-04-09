import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async () => {
	const db = getDb();

	const counts = {
		projects: (db.prepare('SELECT COUNT(*) as c FROM projects').get() as { c: number }).c,
		samples: (db.prepare('SELECT COUNT(*) as c FROM samples WHERE is_deleted = 0').get() as { c: number }).c,
		extracts: (db.prepare('SELECT COUNT(*) as c FROM extracts WHERE is_deleted = 0').get() as { c: number }).c,
		runs: (db.prepare('SELECT COUNT(*) as c FROM sequencing_runs WHERE is_deleted = 0').get() as { c: number }).c
	};

	const recentSamples = db.prepare(`
		SELECT s.*, p.project_name
		FROM samples s
		JOIN projects p ON p.id = s.project_id
		WHERE s.is_deleted = 0
		ORDER BY s.created_at DESC
		LIMIT 10
	`).all() as Array<{ id: string; samp_name: string; project_name: string; mixs_checklist: string; geo_loc_name: string; collection_date: string }>;

	return { counts, recentSamples };
};
