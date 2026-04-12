import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getConstrainedValues } from '$lib/server/constrained-values';
import { getActivePersonnel } from '$lib/server/personnel';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const libraries = db.prepare(`SELECT l.id, l.library_name, l.library_type, l.platform FROM library_preps l WHERE l.is_deleted = 0 ORDER BY l.library_name`).all();
	const libraryPlates = db.prepare(`SELECT p.id, p.plate_name, p.library_type, p.platform,
		(SELECT COUNT(*) FROM library_preps WHERE library_plate_id = p.id AND is_deleted = 0) AS library_count
		FROM library_plates p WHERE p.is_deleted = 0 ORDER BY p.created_at DESC`).all();
	const picklists = getConstrainedValues('seq_platform', 'seq_instrument', 'seq_method', 'person_role');
	const personnel = getActivePersonnel();
	return { libraries, libraryPlates, picklists, personnel };
};
