import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getEntityPersonnel } from '$lib/server/entity-personnel';

export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();
	const extract = db.prepare(`SELECT e.*, s.samp_name, s.id as sample_id FROM extracts e JOIN samples s ON s.id = e.sample_id WHERE e.id = ? AND e.is_deleted = 0`).get(params.extractId);
	if (!extract) throw error(404, 'Extract not found');
	const pcrs = db.prepare('SELECT * FROM pcr_amplifications WHERE extract_id = ? AND is_deleted = 0 ORDER BY created_at DESC').all(params.extractId);
	const libraries = db.prepare('SELECT * FROM library_preps WHERE extract_id = ? AND is_deleted = 0 ORDER BY created_at DESC').all(params.extractId);
	const people = getEntityPersonnel('extract', params.extractId);
	return { extract, pcrs, libraries, people };
};
