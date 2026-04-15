import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';
import { getConstrainedValues } from '$lib/server/constrained-values';
import { getActivePersonnel } from '$lib/server/personnel';

export const load: PageServerLoad = async ({ locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const libraries = db
		.prepare(
			`SELECT l.id, l.library_name, l.library_type, l.platform FROM library_preps l WHERE l.is_deleted = 0 AND l.lab_id = ? ORDER BY l.library_name`
		)
		.all(labId);
	const libraryPlates = db
		.prepare(
			`SELECT p.id, p.plate_name, p.library_type, p.platform,
			(SELECT COUNT(*) FROM library_preps WHERE library_plate_id = p.id AND is_deleted = 0) AS library_count
			FROM library_plates p WHERE p.is_deleted = 0 AND p.lab_id = ? ORDER BY p.created_at DESC`
		)
		.all(labId);
	const picklists = getConstrainedValues(labId, 'seq_platform', 'seq_instrument', 'person_role');
	const personnel = getActivePersonnel(labId);
	return { libraries, libraryPlates, picklists, personnel };
};
