import type Database from 'better-sqlite3';
import { badRequest } from '$lib/server/api-errors';

/**
 * Helpers shared by /api/permits and /api/permits/[id]. Isolated in this
 * module because SvelteKit rejects non-handler exports from +server.ts.
 */

export function loadPermitWithScopes(db: Database.Database, permitId: string) {
	const permit = db.prepare('SELECT * FROM permits WHERE id = ?').get(permitId);
	if (!permit) return null;
	const scopes = db
		.prepare(
			`SELECT ps.*, s.site_name, s.project_id
			   FROM permit_scopes ps
			   JOIN sites s ON s.id = ps.site_id
			  WHERE ps.permit_id = ?
			  ORDER BY s.site_name`
		)
		.all(permitId);
	return { ...permit, scopes };
}

/** Throws 400 if any site_id is not in the caller's lab. */
export function assertSitesInLab(
	db: Database.Database,
	siteIds: string[],
	labId: string
): void {
	if (siteIds.length === 0) return;
	const placeholders = siteIds.map(() => '?').join(',');
	const rows = db
		.prepare(`SELECT id FROM sites WHERE lab_id = ? AND id IN (${placeholders})`)
		.all(labId, ...siteIds) as Array<{ id: string }>;
	const got = new Set(rows.map((r) => r.id));
	for (const s of siteIds) {
		if (!got.has(s)) badRequest('One or more scope sites are not in your lab');
	}
}
