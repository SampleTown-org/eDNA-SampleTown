import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const pcrs = db.prepare(`
		SELECT p.*, e.extract_name
		FROM pcr_amplifications p
		JOIN extracts e ON e.id = p.extract_id
		WHERE p.is_deleted = 0
		ORDER BY p.created_at DESC
	`).all();
	return { pcrs };
};
