import type Database from 'better-sqlite3';
import { badRequest } from '$lib/server/api-errors';

/**
 * Helpers shared by /api/permits and /api/permits/[id]. These used to live
 * in the `+server.ts` files but SvelteKit rejects non-handler exports from
 * +server.ts — so they moved here.
 */

export function loadPermitWithLinks(db: Database.Database, permitId: string) {
	const permit = db.prepare('SELECT * FROM permits WHERE id = ?').get(permitId);
	if (!permit) return null;
	const project_ids = (
		db.prepare('SELECT project_id FROM permit_projects WHERE permit_id = ?').all(permitId) as Array<{
			project_id: string;
		}>
	).map((r) => r.project_id);
	const scopes = db
		.prepare('SELECT * FROM permit_scopes WHERE permit_id = ? ORDER BY valid_from')
		.all(permitId);
	return { ...permit, project_ids, scopes };
}

/** Throws 400 if any project_id is not in the caller's lab. */
export function assertProjectsInLab(
	db: Database.Database,
	projectIds: string[],
	labId: string
): void {
	if (projectIds.length === 0) return;
	const placeholders = projectIds.map(() => '?').join(',');
	const rows = db
		.prepare(`SELECT id FROM projects WHERE lab_id = ? AND id IN (${placeholders})`)
		.all(labId, ...projectIds) as Array<{ id: string }>;
	if (rows.length !== projectIds.length) {
		badRequest('One or more projects are not in your lab');
	}
}

/** Throws 400 if any scope.site_id is not in the caller's lab. */
export function assertScopeSitesInLab(
	db: Database.Database,
	scopes: Array<{ site_id?: string | null }>,
	labId: string
): void {
	const siteIds = scopes
		.map((s) => s.site_id)
		.filter((v): v is string => typeof v === 'string' && v.length > 0);
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
