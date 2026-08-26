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
	/** PCR and library plates left holding nothing, counted the same way. */
	plates: number;
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

/**
 * PCR plates whose every reaction belongs to this project.
 *
 * Plates that were already empty are untouched — they never held one of this
 * project's reactions, so they are not in this set. An operator laying out a
 * plate before filling it is a normal state, and three such plates exist
 * today; only a plate this delete empties is removed.
 */
const PCR_PLATES_EMPTIED_BY_PROJECT = `
	SELECT a.plate_id AS id
	  FROM pcr_amplifications a
	  JOIN extracts e ON e.id = a.extract_id
	  JOIN samples  s ON s.id = e.sample_id
	 WHERE a.plate_id IS NOT NULL
	 GROUP BY a.plate_id
	HAVING SUM(CASE WHEN s.project_id = ? THEN 0 ELSE 1 END) = 0
`;

/** Library plates whose every prep belongs to this project. */
const LIBRARY_PLATES_EMPTIED_BY_PROJECT = `
	SELECT lp.library_plate_id AS id
	  FROM library_preps lp
	  LEFT JOIN extracts e            ON e.id  = lp.extract_id
	  LEFT JOIN samples  es           ON es.id = e.sample_id
	  LEFT JOIN pcr_amplifications p  ON p.id  = lp.pcr_id
	  LEFT JOIN extracts pe           ON pe.id = p.extract_id
	  LEFT JOIN samples  ps           ON ps.id = pe.sample_id
	 WHERE lp.library_plate_id IS NOT NULL
	 GROUP BY lp.library_plate_id
	HAVING SUM(CASE WHEN es.project_id = ? OR ps.project_id = ? THEN 0 ELSE 1 END) = 0
`;

/**
 * The lab-scoped containers this delete would leave holding nothing.
 *
 * Resolved to concrete ids once, and used by both the count and the delete, so
 * the confirmation cannot promise a number the delete does not produce.
 *
 * A PCR plate can be cited as the source of a library plate
 * (`library_plates.pcr_plate_id`), and that reference has no ON DELETE action —
 * removing a cited plate raises a foreign-key error and takes the whole
 * transaction with it. Such a plate is only removable when the library plate
 * citing it is going too, which is why the exclusion is written against the
 * library-plate set rather than against the table.
 */
function emptiedContainers(
	db: Db,
	projectId: string
): { runs: string[]; pcrPlates: string[]; libraryPlates: string[] } {
	const ids = (sql: string, ...params: unknown[]) =>
		(db.prepare(sql).all(...params) as Record<string, string>[]).map(
			(r) => (r.id ?? r.run_id) as string
		);

	return {
		runs: ids(RUNS_EMPTIED_BY_PROJECT, projectId, projectId),
		libraryPlates: ids(LIBRARY_PLATES_EMPTIED_BY_PROJECT, projectId, projectId),
		pcrPlates: ids(
			`SELECT id FROM (${PCR_PLATES_EMPTIED_BY_PROJECT}) AS emptied
			  WHERE NOT EXISTS (
			        SELECT 1 FROM library_plates lpl
			         WHERE lpl.pcr_plate_id = emptied.id
			           AND lpl.id NOT IN (${LIBRARY_PLATES_EMPTIED_BY_PROJECT}))`,
			projectId,
			projectId,
			projectId
		)
	};
}

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
		),
		plates: (() => {
			const c = emptiedContainers(db, projectId);
			return c.pcrPlates.length + c.libraryPlates.length;
		})()
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
 * projects' work, so a plate or run holding anything else survives and only
 * this project's wells, libraries, and run links come off it. One that this
 * delete empties completely is removed: it would otherwise describe no lab
 * work at all, and an archive import creates a run per submitted run, so a
 * single project can leave thousands behind. Plates and runs that were already
 * empty are untouched — they never held this project's work, so nothing here
 * selects them.
 *
 * Caller is responsible for the lab-scope check. Runs in its own transaction.
 */
export function deleteProjectSubtree(db: Db, projectId: string): ProjectDeleteCounts {
	return db.transaction((): ProjectDeleteCounts => {
		// Extracts and reactions go by cascade, and SQLite reports no row count
		// for those, so their figures come from the pre-count. Everything else
		// reports what the statement actually removed — the guarded deletes below
		// can legitimately match nothing, and saying otherwise would hide it.
		const counted = projectDeleteCounts(db, projectId);

		// Captured before anything is deleted: once the contents are gone the
		// grouping that identifies these has nothing left to group.
		const emptied = emptiedContainers(db, projectId);

		const libraries = db
			.prepare(`DELETE FROM library_preps WHERE id IN (${LIBRARIES_OF_PROJECT})`)
			.run(projectId, projectId).changes;

		// Samples cascade into extracts, which cascade into pcr_amplifications,
		// sample_values, and sample_photos.
		const samples = db.prepare('DELETE FROM samples WHERE project_id = ?').run(projectId).changes;
		const sites = db.prepare('DELETE FROM sites WHERE project_id = ?').run(projectId).changes;

		// Guarded by NOT EXISTS so a container that somehow still holds something
		// is left alone, whatever the pre-delete grouping concluded.
		const dropRun = db.prepare(
			`DELETE FROM sequencing_runs
			  WHERE id = ? AND NOT EXISTS (SELECT 1 FROM run_libraries WHERE run_id = ?)`
		);
		let runs = 0;
		for (const id of emptied.runs) runs += dropRun.run(id, id).changes;

		// Library plates first: one may cite a PCR plate that is also going, and
		// that citation has no ON DELETE action to clear it.
		const dropLibraryPlate = db.prepare(
			`DELETE FROM library_plates
			  WHERE id = ? AND NOT EXISTS (SELECT 1 FROM library_preps WHERE library_plate_id = ?)`
		);
		let plates = 0;
		for (const id of emptied.libraryPlates) plates += dropLibraryPlate.run(id, id).changes;

		const dropPcrPlate = db.prepare(
			`DELETE FROM pcr_plates
			  WHERE id = ?
			    AND NOT EXISTS (SELECT 1 FROM pcr_amplifications WHERE plate_id = ?)
			    AND NOT EXISTS (SELECT 1 FROM library_plates WHERE pcr_plate_id = ?)`
		);
		for (const id of emptied.pcrPlates) plates += dropPcrPlate.run(id, id, id).changes;

		db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
		return {
			sites,
			samples,
			extracts: counted.extracts,
			pcrs: counted.pcrs,
			libraries,
			runs,
			plates
		};
	})();
}
