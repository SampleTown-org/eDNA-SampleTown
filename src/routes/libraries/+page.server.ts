import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const libraries = db.prepare(`
		SELECT * FROM library_preps WHERE is_deleted = 0 ORDER BY created_at DESC
	`).all();
	return { libraries };
};
