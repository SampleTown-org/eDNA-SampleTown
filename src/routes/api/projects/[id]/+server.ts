import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { requireLab } from '$lib/server/guards';
import { assertLabOwnsRow } from '$lib/server/lab-scope';

const nn = (v: unknown): unknown => (typeof v === 'string' && v.trim() === '' ? null : v);

export const GET: RequestHandler = async ({ params, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const row = db
		.prepare('SELECT * FROM projects WHERE id = ? AND lab_id = ?')
		.get(params.id, labId);
	if (!row) throw error(404, 'Project not found');
	return json(row);
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	try {
		const { labId } = requireLab(locals);
		const data = await request.json();
		if (!data?.project_name?.trim()) {
			return json({ error: 'project_name is required' }, { status: 400 });
		}
		const db = getDb();
		assertLabOwnsRow(db, 'projects', params.id!, labId, 'Project not found');
		db.prepare(
			`UPDATE projects SET
				project_name = ?, description = ?, pi_name = ?, institution = ?,
				contact_email = ?, funding_sources = ?,
				github_repo = ?, updated_at = datetime('now')
			 WHERE id = ?`
		).run(
			data.project_name.trim(),
			nn(data.description),
			nn(data.pi_name),
			nn(data.institution),
			nn(data.contact_email),
			nn(data.funding_sources),
			nn(data.github_repo),
			params.id
		);
		return json(db.prepare('SELECT * FROM projects WHERE id = ?').get(params.id));
	} catch (err) {
		return apiError(err);
	}
};

/**
 * Hard-delete a project and everything belonging to it.
 *
 * The subtree is removed explicitly, bottom-up, rather than leaning on
 * `ON DELETE CASCADE`. Two constraints make the delete order load-bearing, and
 * SQLite does not promise one:
 *
 *   - `library_preps` forgets a deleted source via ON DELETE SET NULL, but a
 *     row left with no pcr, extract or plate violates its own CHECK. That
 *     aborts the entire statement, which is why deleting any project holding
 *     libraries failed outright.
 *   - `samples.site_id` is ON DELETE RESTRICT, so a site cannot go before the
 *     samples standing on it.
 *
 * Plates and sequencing runs are lab-scoped and routinely carry other
 * projects' work, so those rows survive; only this project's libraries,
 * reactions, and run links go with it. Sites belong to exactly one project
 * (`sites.project_id` is NOT NULL and single-valued), so a location shared by
 * two projects exists as two rows and only this project's copy is removed.
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	try {
		const { labId } = requireLab(locals);
		const db = getDb();
		const projectId = params.id!;
		assertLabOwnsRow(db, 'projects', projectId, labId, 'Project not found');

		const deleted = db.transaction(() => {
			// Runs that hold this project's libraries. A run can span projects,
			// so it is only removed below if deleting those libraries leaves it
			// with nothing in it at all.
			const touchedRunIds = (
				db
					.prepare(
						`SELECT DISTINCT rl.run_id
						   FROM run_libraries rl
						   JOIN library_preps lp ON lp.id = rl.library_id
						   LEFT JOIN extracts e ON e.id = lp.extract_id
						   LEFT JOIN samples es ON es.id = e.sample_id
						   LEFT JOIN pcr_amplifications p ON p.id = lp.pcr_id
						   LEFT JOIN extracts pe ON pe.id = p.extract_id
						   LEFT JOIN samples ps ON ps.id = pe.sample_id
						  WHERE es.project_id = ? OR ps.project_id = ?`
					)
					.all(projectId, projectId) as { run_id: string }[]
			).map((r) => r.run_id);

			const libraries = db
				.prepare(
					`DELETE FROM library_preps
					  WHERE extract_id IN (
					        SELECT e.id FROM extracts e
					          JOIN samples s ON s.id = e.sample_id
					         WHERE s.project_id = ?)
					     OR pcr_id IN (
					        SELECT p.id FROM pcr_amplifications p
					          JOIN extracts e ON e.id = p.extract_id
					          JOIN samples s ON s.id = e.sample_id
					         WHERE s.project_id = ?)`
				)
				.run(projectId, projectId).changes;

			// Samples cascade into extracts, which cascade into
			// pcr_amplifications, sample_values, and sample_photos.
			const samples = db.prepare('DELETE FROM samples WHERE project_id = ?').run(projectId).changes;
			const sites = db.prepare('DELETE FROM sites WHERE project_id = ?').run(projectId).changes;

			// An archive import creates a run per submitted run, so a project
			// can own thousands of them. Once its libraries are gone those runs
			// hold nothing; leaving them behind fills the run list with entries
			// that describe no sequencing at all.
			const dropEmptyRun = db.prepare(
				`DELETE FROM sequencing_runs
				  WHERE id = ?
				    AND NOT EXISTS (SELECT 1 FROM run_libraries WHERE run_id = ?)`
			);
			let runs = 0;
			for (const runId of touchedRunIds) runs += dropEmptyRun.run(runId, runId).changes;

			db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
			return { samples, sites, libraries, runs };
		})();

		return json({ ok: true, deleted });
	} catch (err) {
		return apiError(err);
	}
};
