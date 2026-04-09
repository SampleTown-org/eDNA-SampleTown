import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async ({ url }) => {
	const db = getDb();
	const samples = db.prepare(`SELECT s.id, s.samp_name, p.project_name FROM samples s JOIN projects p ON p.id = s.project_id WHERE s.is_deleted = 0 ORDER BY s.samp_name`).all();
	return { samples, preselectedSampleId: url.searchParams.get('sample_id') || '' };
};
