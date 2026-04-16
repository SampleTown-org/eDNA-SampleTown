import type { Database } from 'better-sqlite3';
import type { Permit } from '$lib/types';

/**
 * Permit-coverage helpers.
 *
 * A sample is covered by permit P iff P has a `permit_scopes` row with
 * site_id = sample.site_id AND sample.collection_date ∈
 * [valid_from, valid_until] (NULL endpoints = open-ended).
 *
 * Project linkage is derived at query time via sites.project_id — there is
 * no direct permit↔project junction. A permit "touches" a project when one
 * of its scope rows points at a site belonging to that project.
 *
 * The lab_id filter is enforced everywhere so a stray join can't leak
 * permits across labs even if called from a mis-scoped handler.
 */

const COVERAGE_SQL = `
  SELECT DISTINCT p.*
    FROM permits p
    JOIN permit_scopes ps ON ps.permit_id = p.id
   WHERE p.lab_id = @lab_id
     AND ps.site_id = @site_id
     AND (ps.valid_from  IS NULL OR ps.valid_from  <= @collection_date)
     AND (ps.valid_until IS NULL OR ps.valid_until >= @collection_date)
`;

/** Permits that cover this sample (empty = uncovered). */
export function permitsCoveringSample(
	db: Database,
	args: { labId: string; siteId: string; collectionDate: string }
): Permit[] {
	return db
		.prepare(COVERAGE_SQL)
		.all({
			lab_id: args.labId,
			site_id: args.siteId,
			collection_date: args.collectionDate
		}) as Permit[];
}

/**
 * Batch form for list views: returns a Map<sampleId, permitCount>. Zero-count
 * samples are NOT included; callers should default missing keys to 0.
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
        JOIN permit_scopes ps ON ps.site_id = s.site_id
        JOIN permits       p  ON p.id = ps.permit_id AND p.lab_id = s.lab_id
       WHERE s.lab_id = ?
         AND s.id IN (${placeholders})
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

/**
 * Replace (permit_id, site_id) scope rows for a permit with the given set.
 * Any site currently linked that isn't in `scopes` is dropped; each entry in
 * `scopes` is upserted with the provided date window.
 */
export function replacePermitScopes(
	db: Database,
	permitId: string,
	scopes: Array<{
		site_id: string;
		valid_from?: string | null;
		valid_until?: string | null;
		notes?: string | null;
	}>
): void {
	const keepSiteIds = scopes.map((s) => s.site_id);

	const txn = db.transaction(() => {
		if (keepSiteIds.length === 0) {
			db.prepare('DELETE FROM permit_scopes WHERE permit_id = ?').run(permitId);
		} else {
			const placeholders = keepSiteIds.map(() => '?').join(',');
			db.prepare(
				`DELETE FROM permit_scopes WHERE permit_id = ? AND site_id NOT IN (${placeholders})`
			).run(permitId, ...keepSiteIds);
		}
		const upsert = db.prepare(
			`INSERT INTO permit_scopes (id, permit_id, site_id, valid_from, valid_until, notes)
			 VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?)
			 ON CONFLICT (permit_id, site_id) DO UPDATE SET
			   valid_from = excluded.valid_from,
			   valid_until = excluded.valid_until,
			   notes = excluded.notes`
		);
		for (const s of scopes) {
			upsert.run(permitId, s.site_id, s.valid_from ?? null, s.valid_until ?? null, s.notes ?? null);
		}
	});
	txn();
}

/**
 * Add/update a single (permit, site) scope row. Idempotent — re-running with
 * a changed date window updates in place. Used by the site-detail CRUD UI
 * and by the "add cart to permit" action.
 */
export function upsertPermitScope(
	db: Database,
	args: {
		permit_id: string;
		site_id: string;
		valid_from?: string | null;
		valid_until?: string | null;
		notes?: string | null;
	}
): void {
	db.prepare(
		`INSERT INTO permit_scopes (id, permit_id, site_id, valid_from, valid_until, notes)
		 VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?)
		 ON CONFLICT (permit_id, site_id) DO UPDATE SET
		   valid_from = excluded.valid_from,
		   valid_until = excluded.valid_until,
		   notes = excluded.notes`
	).run(
		args.permit_id,
		args.site_id,
		args.valid_from ?? null,
		args.valid_until ?? null,
		args.notes ?? null
	);
}
