import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const libraries = db.prepare(`SELECT l.id, l.library_name, l.library_type, l.platform FROM library_preps l WHERE l.is_deleted = 0 ORDER BY l.library_name`).all();
	return { libraries };
};
