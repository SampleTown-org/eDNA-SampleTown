import type { getDb } from './db';

type Db = ReturnType<typeof getDb>;

/** What a project delete removes, by table. */
export interface ProjectDeleteCounts {
	sites: number;
	samples: number;
	extracts: number;
	pcrs: number;
	libraries: number;
	/** Sequencing runs left holding nothing once this project's libraries go. */
	runs: number;
}

/**
 * Library preps derived from a project's material.
 *
 * A library hangs off either an extract or a PCR reaction, and both trace back
 * to a sample through the same chain, so either route counts. Used verbatim by
 * the count and the delete — the confirmation would otherwise drift from what
 * actually happens.
 */
const LIBRARIES_OF_PROJECT = `
	SELECT lp.id
	  FROM library_preps lp
	  LEFT JOIN extracts e            ON e.id  = lp.extract_id
	  LEFT JOIN samples  es           ON es.id = e.sample_id
	  LEFT JOIN pcr_amplifications p  ON p.id  = lp.pcr_id
	  LEFT JOIN extracts pe           ON pe.id = p.extract_id
	  LEFT JOIN samples  ps           ON ps.id = pe.sample_id
	 WHERE es.project_id = ? OR ps.project_id = ?
`;

/**
 * Runs whose every linked library belongs to this project — the ones that
 * would be left describing no sequencing at all.
 */
const RUNS_EMPTIED_BY_PROJECT = `
	SELECT rl.run_id
	  FROM run_libraries rl
	 GROUP BY rl.run_id
	HAVING SUM(CASE WHEN rl.library_id IN (${LIBRARIES_OF_PROJECT}) THEN 0 ELSE 1 END) = 0
`;

/** Count what deleting this project would remove, without removing it. */
export function projectDeleteCounts(db: Db, projectId: string): ProjectDeleteCounts {
	const one = (sql: string, ...params: unknown[]) =>
		(db.prepare(sql).get(...params) as { c: number }).c;

	return {
		sites: one('SELECT COUNT(*) c FROM sites WHERE project_id = ?', projectId),
		samples: one('SELECT COUNT(*) c FROM samples WHERE project_id = ?', projectId),
		extracts: one(
			`SELECT COUNT(*) c FROM extracts e
			   JOIN samples s ON s.id = e.sample_id
			  WHERE s.project_id = ?`,
			projectId
		),
		pcrs: one(
			`SELECT COUNT(*) c FROM pcr_amplifications p
			   JOIN extracts e ON e.id = p.extract_id
			   JOIN samples  s ON s.id = e.sample_id
			  WHERE s.project_id = ?`,
			projectId
		),
		libraries: one(
			`SELECT COUNT(*) c FROM (${LIBRARIES_OF_PROJECT})`,
			projectId,
			projectId
		),
		runs: one(
			`SELECT COUNT(*) c FROM (${RUNS_EMPTIED_BY_PROJECT})`,
			projectId,
			projectId
		)
	};
}

/**
 * Delete a project and everything belonging to it, bottom-up.
 *
 * The order is explicit rather than left to `ON DELETE` cascades, which SQLite
 * runs in no promised order. Two constraints make that order load-bearing:
 *
 *   - `library_preps` forgets a deleted source via ON DELETE SET NULL, but a
 *     row left with no pcr, extract, or plate violates its own CHECK, which
 *     aborts the whole statement.
 *   - `samples.site_id` is ON DELETE RESTRICT, so a site cannot go before the
 *     samples standing on it.
 *
 * Plates and sequencing runs belong to the lab and routinely carry other
 * projects' work, so those rows survive; only this project's libraries,
 * reactions, and run links go. A run left holding nothing is the exception —
 * an archive import creates one per submitted run, so a single project can
 * otherwise leave thousands of empty ones behind.
 *
 * Caller is responsible for the lab-scope check. Runs in its own transaction.
 */
export function deleteProjectSubtree(db: Db, projectId: string): ProjectDeleteCounts {
	return db.transaction((): ProjectDeleteCounts => {
		const counted = projectDeleteCounts(db, projectId);

		const emptied = (
			db.prepare(RUNS_EMPTIED_BY_PROJECT).all(projectId, projectId) as { run_id: string }[]
		).map((r) => r.run_id);

		db.prepare(
			`DELETE FROM library_preps WHERE id IN (${LIBRARIES_OF_PROJECT})`
		).run(projectId, projectId);

		// Samples cascade into extracts, which cascade into pcr_amplifications,
		// sample_values, and sample_photos.
		db.prepare('DELETE FROM samples WHERE project_id = ?').run(projectId);
		db.prepare('DELETE FROM sites WHERE project_id = ?').run(projectId);

		const dropRun = db.prepare('DELETE FROM sequencing_runs WHERE id = ?');
		for (const runId of emptied) dropRun.run(runId);

		db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
		return counted;
	})();
}
