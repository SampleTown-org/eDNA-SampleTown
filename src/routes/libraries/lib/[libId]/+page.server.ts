import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const library = db
		.prepare('SELECT * FROM library_preps WHERE id = ? AND is_deleted = 0 AND lab_id = ?')
		.get(params.libId, labId);
	if (!library) throw error(404, 'Library not found');

	type Source = {
		type: string; name: string; id: string;
		extract_name?: string; extract_id?: string;
		sample_name?: string; sample_id?: string;
		site_name?: string; site_id?: string;
		project_name?: string; project_id?: string;
	};
	let source: Source | null = null;
	if ((library as any).pcr_id) {
		const pcr = db.prepare(`SELECT p.pcr_name, p.id, e.extract_name, e.id as extract_id,
				s.samp_name, s.id as sample_id, s.site_id, st.site_name, s.project_id, proj.project_name
			FROM pcr_amplifications p
			JOIN extracts e ON e.id = p.extract_id
			JOIN samples s ON s.id = e.sample_id
			JOIN sites st ON st.id = s.site_id
			JOIN projects proj ON proj.id = s.project_id
			WHERE p.id = ?`).get((library as any).pcr_id) as any;
		if (pcr) source = {
			type: 'PCR', name: pcr.pcr_name, id: pcr.id,
			extract_name: pcr.extract_name, extract_id: pcr.extract_id,
			sample_name: pcr.samp_name, sample_id: pcr.sample_id,
			site_name: pcr.site_name, site_id: pcr.site_id,
			project_name: pcr.project_name, project_id: pcr.project_id
		};
	} else if ((library as any).extract_id) {
		const ext = db.prepare(`SELECT e.extract_name, e.id, s.samp_name, s.id as sample_id,
				s.site_id, st.site_name, s.project_id, proj.project_name
			FROM extracts e
			JOIN samples s ON s.id = e.sample_id
			JOIN sites st ON st.id = s.site_id
			JOIN projects proj ON proj.id = s.project_id
			WHERE e.id = ?`).get((library as any).extract_id) as any;
		if (ext) source = {
			type: 'Extract', name: ext.extract_name, id: ext.id,
			sample_name: ext.samp_name, sample_id: ext.sample_id,
			site_name: ext.site_name, site_id: ext.site_id,
			project_name: ext.project_name, project_id: ext.project_id
		};
	}

	// Get plate info if this library belongs to one
	let plate = null;
	if ((library as any).library_plate_id) {
		plate = db.prepare('SELECT id, plate_name FROM library_plates WHERE id = ?').get((library as any).library_plate_id);
	}

	const runs = db.prepare(`SELECT r.* FROM sequencing_runs r JOIN run_libraries rl ON rl.run_id = r.id WHERE rl.library_id = ? AND r.is_deleted = 0`).all(params.libId);
	return { library, source, plate, runs };
};
