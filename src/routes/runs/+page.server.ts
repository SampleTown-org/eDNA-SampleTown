import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { attachPeopleSummary } from '$lib/server/entity-personnel';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const runs = db.prepare(`
		SELECT * FROM sequencing_runs WHERE is_deleted = 0 ORDER BY created_at DESC
	`).all() as { id: string }[];
	return { runs: attachPeopleSummary('sequencing_run', runs) };
};
