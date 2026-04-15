import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const project = db
		.prepare('SELECT * FROM projects WHERE id = ? AND lab_id = ?')
		.get(params.projectId, labId);
	if (!project) throw error(404, 'Project not found');

	const samples = db.prepare(`
		SELECT s.*, st.site_name
		FROM samples s
		JOIN sites st ON st.id = s.site_id
		WHERE s.project_id = ? AND s.is_deleted = 0
		ORDER BY s.created_at DESC
	`).all(params.projectId);

	// People roster — every person who has a recorded role on any entity
	// downstream of this project. The CTE walks: samples → extracts → pcr
	// amplifications (for plates) → library preps (for library plates) →
	// run_libraries (for sequencing runs). entity_personnel hangs off the
	// PLATE / RUN level (not per-amplification), so we DISTINCT plate/run
	// ids before joining.
	//
	// Output: one row per (person, entity_type, role) with a count, then
	// rolled up in JS to one row per person with comma-joined roles.
	const rosterRaw = db.prepare(`
		WITH project_entities AS (
			SELECT 'sample' AS entity_type, id AS entity_id
			FROM samples WHERE project_id = ? AND is_deleted = 0

			UNION ALL
			SELECT 'extract', e.id
			FROM extracts e
			JOIN samples s ON s.id = e.sample_id
			WHERE s.project_id = ? AND e.is_deleted = 0

			UNION
			SELECT DISTINCT 'pcr_plate', pa.plate_id
			FROM pcr_amplifications pa
			JOIN extracts e ON e.id = pa.extract_id
			JOIN samples s ON s.id = e.sample_id
			WHERE s.project_id = ? AND pa.plate_id IS NOT NULL AND pa.is_deleted = 0

			UNION
			SELECT DISTINCT 'library_plate', lp.library_plate_id
			FROM library_preps lp
			LEFT JOIN pcr_amplifications pa ON pa.id = lp.pcr_id
			LEFT JOIN extracts ee ON ee.id = lp.extract_id
			LEFT JOIN extracts ep ON ep.id = pa.extract_id
			JOIN samples s ON s.id = COALESCE(ee.sample_id, ep.sample_id)
			WHERE s.project_id = ? AND lp.library_plate_id IS NOT NULL AND lp.is_deleted = 0

			UNION
			SELECT DISTINCT 'sequencing_run', rl.run_id
			FROM run_libraries rl
			JOIN library_preps lp ON lp.id = rl.library_id
			LEFT JOIN pcr_amplifications pa ON pa.id = lp.pcr_id
			LEFT JOIN extracts ee ON ee.id = lp.extract_id
			LEFT JOIN extracts ep ON ep.id = pa.extract_id
			JOIN samples s ON s.id = COALESCE(ee.sample_id, ep.sample_id)
			WHERE s.project_id = ? AND lp.is_deleted = 0
		)
		SELECT
			p.id, p.full_name, p.email, p.role AS title, p.institution, p.orcid,
			ep.entity_type,
			ep.role AS contribution_role,
			COUNT(*) AS contribution_count
		FROM project_entities pe
		JOIN entity_personnel ep ON ep.entity_type = pe.entity_type AND ep.entity_id = pe.entity_id
		JOIN personnel p ON p.id = ep.personnel_id
		WHERE p.is_active = 1
		GROUP BY p.id, ep.entity_type, ep.role
		ORDER BY p.full_name, ep.entity_type
	`).all(params.projectId, params.projectId, params.projectId, params.projectId, params.projectId) as {
		id: string;
		full_name: string;
		email: string | null;
		title: string | null;
		institution: string | null;
		orcid: string | null;
		entity_type: string;
		contribution_role: string | null;
		contribution_count: number;
	}[];

	// Roll up to one row per person. `roles` joins distinct (entity_type,
	// role) pairs so e.g. "extractor (extract), pcr operator (pcr_plate)"
	// reads naturally. `total` is the sum of contribution counts.
	const rosterMap = new Map<string, {
		id: string;
		full_name: string;
		email: string | null;
		title: string | null;
		institution: string | null;
		orcid: string | null;
		roles: string;
		total: number;
		_roleSet: Set<string>;
	}>();
	for (const r of rosterRaw) {
		let row = rosterMap.get(r.id);
		if (!row) {
			row = {
				id: r.id,
				full_name: r.full_name,
				email: r.email,
				title: r.title,
				institution: r.institution,
				orcid: r.orcid,
				roles: '',
				total: 0,
				_roleSet: new Set()
			};
			rosterMap.set(r.id, row);
		}
		const label = r.contribution_role
			? `${r.contribution_role} (${r.entity_type})`
			: r.entity_type;
		row._roleSet.add(label);
		row.total += r.contribution_count;
	}
	const roster = Array.from(rosterMap.values())
		.map((r) => ({
			id: r.id,
			full_name: r.full_name,
			email: r.email,
			title: r.title,
			institution: r.institution,
			orcid: r.orcid,
			roles: Array.from(r._roleSet).sort().join(', '),
			total: r.total
		}))
		.sort((a, b) => b.total - a.total || a.full_name.localeCompare(b.full_name));

	return { project, samples, roster };
};
