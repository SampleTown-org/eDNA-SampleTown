import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getConstrainedValues } from '$lib/server/constrained-values';
import { getActivePersonnel } from '$lib/server/personnel';
import { getEntityPersonnel } from '$lib/server/entity-personnel';

/**
 * Like /pcr/[pcrId]/edit, the same `[libraryId]` slug serves both library
 * plates and individual library_preps. Try as a plate first; fall back to
 * an individual library if no plate matches.
 */
export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();

	const plate = db
		.prepare('SELECT * FROM library_plates WHERE id = ? AND is_deleted = 0')
		.get(params.libraryId);
	if (plate) {
		const personnel = getActivePersonnel();
		const picklists = getConstrainedValues('person_role', 'library_strategy', 'library_source', 'library_selection', 'library_prep_kit');
		const people = getEntityPersonnel('library_plate', params.libraryId).map((p) => ({
			personnel_id: p.personnel_id,
			role: p.role
		}));
		return { type: 'plate' as const, plate, personnel, picklists, people };
	}

	const library = db
		.prepare('SELECT * FROM library_preps WHERE id = ? AND is_deleted = 0')
		.get(params.libraryId);
	if (!library) throw error(404, 'Library plate or library not found');
	const picklists = getConstrainedValues('barcode');
	return { type: 'library' as const, library, picklists };
};
