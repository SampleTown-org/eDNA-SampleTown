import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getEntityPersonnel } from '$lib/server/entity-personnel';

export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();

	// Try as library plate first
	const plate = db.prepare(`
		SELECT p.*, pp.plate_name AS pcr_plate_name
		FROM library_plates p
		LEFT JOIN pcr_plates pp ON pp.id = p.pcr_plate_id
		WHERE p.id = ? AND p.is_deleted = 0
	`).get(params.libraryId);
	if (plate) {
		const libraries = db.prepare(`
			SELECT l.*,
				COALESCE(r.pcr_name, e.extract_name) AS source_name,
				CASE WHEN l.pcr_id IS NOT NULL THEN 'PCR' ELSE 'Extract' END AS source_type
			FROM library_preps l
			LEFT JOIN pcr_amplifications r ON r.id = l.pcr_id
			LEFT JOIN extracts e ON e.id = l.extract_id
			WHERE l.library_plate_id = ? AND l.is_deleted = 0
			ORDER BY l.library_name
		`).all(params.libraryId);

		const runs = db.prepare(`
			SELECT DISTINCT sr.* FROM sequencing_runs sr
			JOIN run_libraries rl ON rl.run_id = sr.id
			JOIN library_preps l ON l.id = rl.library_id
			WHERE l.library_plate_id = ? AND sr.is_deleted = 0
		`).all(params.libraryId);

		const people = getEntityPersonnel('library_plate', params.libraryId);
		return { type: 'plate', plate, libraries, runs, people };
	}

	// Fall back to individual library
	const library = db.prepare('SELECT * FROM library_preps WHERE id = ? AND is_deleted = 0').get(params.libraryId);
	if (!library) throw error(404, 'Library plate or library not found');

	let source: { type: string; name: string; id: string; sample_name?: string; sample_id?: string } | null = null;
	if ((library as any).pcr_id) {
		const pcr = db.prepare(`SELECT p.pcr_name, p.id, e.extract_name, s.samp_name, s.id as sample_id
			FROM pcr_amplifications p JOIN extracts e ON e.id = p.extract_id JOIN samples s ON s.id = e.sample_id WHERE p.id = ?`).get((library as any).pcr_id) as any;
		if (pcr) source = { type: 'PCR', name: pcr.pcr_name, id: pcr.id, sample_name: pcr.samp_name, sample_id: pcr.sample_id };
	} else if ((library as any).extract_id) {
		const ext = db.prepare(`SELECT e.extract_name, e.id, s.samp_name, s.id as sample_id
			FROM extracts e JOIN samples s ON s.id = e.sample_id WHERE e.id = ?`).get((library as any).extract_id) as any;
		if (ext) source = { type: 'Extract', name: ext.extract_name, id: ext.id, sample_name: ext.samp_name, sample_id: ext.sample_id };
	}

	const runs = db.prepare(`SELECT r.* FROM sequencing_runs r JOIN run_libraries rl ON rl.run_id = r.id WHERE rl.library_id = ? AND r.is_deleted = 0`).all(params.libraryId);
	return { type: 'library', library, source, runs };
};
