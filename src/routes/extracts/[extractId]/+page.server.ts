import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';
import { getEntityPersonnel } from '$lib/server/entity-personnel';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const extract = db.prepare(`SELECT e.*, s.samp_name, s.id as sample_id,
			s.site_id, st.site_name, s.project_id, p.project_name
		FROM extracts e
		JOIN samples s ON s.id = e.sample_id
		JOIN sites st ON st.id = s.site_id
		JOIN projects p ON p.id = s.project_id
		WHERE e.id = ? AND e.is_deleted = 0 AND e.lab_id = ?`).get(params.extractId, labId);
	if (!extract) throw error(404, 'Extract not found');
	const pcrs = db.prepare(`
		SELECT r.*, ps.target_gene
		FROM pcr_amplifications r
		LEFT JOIN primer_sets ps ON ps.id = r.primer_set_id
		WHERE r.extract_id = ? AND r.is_deleted = 0
		ORDER BY r.created_at DESC
	`).all(params.extractId);
	const libraries = db.prepare('SELECT * FROM library_preps WHERE extract_id = ? AND is_deleted = 0 ORDER BY created_at DESC').all(params.extractId);
	const people = getEntityPersonnel('extract', params.extractId);
	return { extract, pcrs, libraries, people };
};
