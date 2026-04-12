import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getEntityPersonnel } from '$lib/server/entity-personnel';

export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();
	const run = db.prepare('SELECT * FROM sequencing_runs WHERE id = ? AND is_deleted = 0').get(params.runId);
	if (!run) throw error(404, 'Run not found');
	const libraries = db.prepare(`SELECT l.* FROM library_preps l JOIN run_libraries rl ON rl.library_id = l.id WHERE rl.run_id = ? AND l.is_deleted = 0`).all(params.runId);
	const analyses = db.prepare('SELECT * FROM analyses WHERE run_id = ? ORDER BY created_at DESC').all(params.runId);
	const people = getEntityPersonnel('sequencing_run', params.runId);
	return { run, libraries, analyses, people };
};
