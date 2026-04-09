import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const extracts = db.prepare(`
		SELECT e.*, s.samp_name
		FROM extracts e
		JOIN samples s ON s.id = e.sample_id
		WHERE e.is_deleted = 0
		ORDER BY e.created_at DESC
	`).all();
	return { extracts };
};
