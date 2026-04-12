import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getConstrainedValues } from '$lib/server/constrained-values';
import { getActivePersonnel } from '$lib/server/personnel';
import { getEntityPersonnel } from '$lib/server/entity-personnel';

export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();
	const run = db.prepare('SELECT * FROM sequencing_runs WHERE id = ? AND is_deleted = 0').get(params.runId);
	if (!run) throw error(404, 'Run not found');

	// Mirror runs/new's loader: same picklists + library catalog so the edit
	// form can re-attach / detach libraries with the same affordance.
	const picklists = getConstrainedValues('seq_platform', 'seq_instrument', 'seq_method', 'person_role');
	const personnel = getActivePersonnel();
	const libraries = db.prepare(
		`SELECT l.id, l.library_name, l.library_type, l.platform FROM library_preps l WHERE l.is_deleted = 0 ORDER BY l.library_name`
	).all();
	const libraryPlates = db.prepare(
		`SELECT p.id, p.plate_name, p.library_type, p.platform,
			(SELECT COUNT(*) FROM library_preps WHERE library_plate_id = p.id AND is_deleted = 0) AS library_count
		 FROM library_plates p WHERE p.is_deleted = 0 ORDER BY p.created_at DESC`
	).all();
	const attachedLibraryIds = (db.prepare(
		`SELECT library_id FROM run_libraries WHERE run_id = ?`
	).all(params.runId) as { library_id: string }[]).map((r) => r.library_id);

	const people = getEntityPersonnel('sequencing_run', params.runId).map((p) => ({
		personnel_id: p.personnel_id,
		role: p.role
	}));

	return { run, picklists, personnel, libraries, libraryPlates, attachedLibraryIds, people };
};
