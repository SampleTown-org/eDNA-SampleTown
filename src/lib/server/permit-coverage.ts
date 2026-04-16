import type { Database } from 'better-sqlite3';
import type { Permit } from '$lib/types';

/**
 * Permit-coverage helpers.
 *
 * Coverage rule (see schema.sql permits comment for the full definition):
 *   A sample is covered by permit P iff
 *     1. P is linked to the sample's project via permit_projects, AND
 *     2. P has a permit_scopes row matching the sample's site
 *        (or scope.site_id IS NULL, meaning "all sites"), AND
 *     3. sample.collection_date is within [valid_from, valid_until]
 *        (inclusive; NULLs treated as open-ended).
 *
 * The lab_id filter is enforced everywhere so a stray join can't leak permits
 * across labs even if called from a mis-scoped handler.
 */

const COVERAGE_SQL = `
  SELECT DISTINCT p.*
    FROM permits p
    JOIN permit_projects pp ON pp.permit_id = p.id
    JOIN permit_scopes  ps ON ps.permit_id = p.id
   WHERE p.lab_id = @lab_id
     AND pp.project_id = @project_id
     AND (ps.site_id IS NULL OR ps.site_id = @site_id)
     AND (ps.valid_from  IS NULL OR ps.valid_from  <= @collection_date)
     AND (ps.valid_until IS NULL OR ps.valid_until >= @collection_date)
`;

/** Permits that cover this sample (empty = uncovered). */
export function permitsCoveringSample(
	db: Database,
	args: { labId: string; projectId: string; siteId: string; collectionDate: string }
): Permit[] {
	return db
		.prepare(COVERAGE_SQL)
		.all({
			lab_id: args.labId,
			project_id: args.projectId,
			site_id: args.siteId,
			collection_date: args.collectionDate
		}) as Permit[];
}

/**
 * Batch form for list views: returns a Map<sampleId, permitCount>. Zero-count
 * samples are NOT included; callers should default missing keys to 0. Used by
 * the missing-permit badge.
 */
export function sampleCoverageCounts(
	db: Database,
	labId: string,
	sampleIds: string[]
): Map<string, number> {
	if (sampleIds.length === 0) return new Map();

	const placeholders = sampleIds.map(() => '?').join(',');
	const rows = db
		.prepare(
			`
      SELECT s.id AS sample_id, COUNT(DISTINCT p.id) AS permit_count
        FROM samples s
        JOIN permit_projects pp ON pp.project_id = s.project_id
        JOIN permits       p    ON p.id = pp.permit_id AND p.lab_id = s.lab_id
        JOIN permit_scopes ps   ON ps.permit_id = p.id
       WHERE s.lab_id = ?
         AND s.id IN (${placeholders})
         AND (ps.site_id IS NULL OR ps.site_id = s.site_id)
         AND (ps.valid_from  IS NULL OR ps.valid_from  <= s.collection_date)
         AND (ps.valid_until IS NULL OR ps.valid_until >= s.collection_date)
       GROUP BY s.id
      `
		)
		.all(labId, ...sampleIds) as Array<{ sample_id: string; permit_count: number }>;

	const out = new Map<string, number>();
	for (const r of rows) out.set(r.sample_id, r.permit_count);
	return out;
}

/** Projects linked to a permit. */
export function permitProjects(db: Database, permitId: string): string[] {
	return (
		db
			.prepare('SELECT project_id FROM permit_projects WHERE permit_id = ?')
			.all(permitId) as Array<{ project_id: string }>
	).map((r) => r.project_id);
}

/**
 * Replace the full set of project links for a permit. Caller is responsible
 * for validating that all project_ids belong to the permit's lab.
 */
export function setPermitProjects(db: Database, permitId: string, projectIds: string[]): void {
	const txn = db.transaction((ids: string[]) => {
		db.prepare('DELETE FROM permit_projects WHERE permit_id = ?').run(permitId);
		const insert = db.prepare(
			'INSERT INTO permit_projects (permit_id, project_id) VALUES (?, ?)'
		);
		for (const pid of ids) insert.run(permitId, pid);
	});
	txn(projectIds);
}
