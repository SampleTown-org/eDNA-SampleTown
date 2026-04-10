import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();

	const sample = db.prepare(`
		SELECT s.*, p.project_name, st.site_name
		FROM samples s
		JOIN projects p ON p.id = s.project_id
		LEFT JOIN sites st ON st.id = s.site_id
		WHERE s.id = ? AND s.is_deleted = 0
	`).get(params.sampleId);
	if (!sample) throw error(404, 'Sample not found');

	const extracts = db.prepare(`
		SELECT * FROM extracts WHERE sample_id = ? AND is_deleted = 0 ORDER BY created_at DESC
	`).all(params.sampleId);

	return { sample, extracts };
};
