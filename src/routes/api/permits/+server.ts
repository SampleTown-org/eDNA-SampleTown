import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { apiError, badRequest } from '$lib/server/api-errors';
import { requireLab } from '$lib/server/guards';
import { parseBody } from '$lib/server/validation';
import { PermitCreateBody } from '$lib/server/schemas/permits';
import { setPermitProjects } from '$lib/server/permit-coverage';

/**
 * GET /api/permits
 * List permits for the caller's lab. Each permit is returned with its linked
 * project_ids and scope rows so the list view has everything it needs without
 * per-row follow-up fetches.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const permits = db
		.prepare('SELECT * FROM permits WHERE lab_id = ? ORDER BY created_at DESC')
		.all(labId) as Array<{ id: string }>;

	if (permits.length === 0) return json([]);

	const ids = permits.map((p) => p.id);
	const placeholders = ids.map(() => '?').join(',');

	const projectLinks = db
		.prepare(`SELECT permit_id, project_id FROM permit_projects WHERE permit_id IN (${placeholders})`)
		.all(...ids) as Array<{ permit_id: string; project_id: string }>;

	const scopes = db
		.prepare(
			`SELECT * FROM permit_scopes WHERE permit_id IN (${placeholders}) ORDER BY valid_from`
		)
		.all(...ids) as Array<{ permit_id: string }>;

	const byPermitProjects = new Map<string, string[]>();
	for (const link of projectLinks) {
		const arr = byPermitProjects.get(link.permit_id) ?? [];
		arr.push(link.project_id);
		byPermitProjects.set(link.permit_id, arr);
	}
	const byPermitScopes = new Map<string, unknown[]>();
	for (const s of scopes) {
		const arr = byPermitScopes.get(s.permit_id) ?? [];
		arr.push(s);
		byPermitScopes.set(s.permit_id, arr);
	}

	return json(
		permits.map((p) => ({
			...p,
			project_ids: byPermitProjects.get(p.id) ?? [],
			scopes: byPermitScopes.get(p.id) ?? []
		}))
	);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, labId } = requireLab(locals);
	const parsed = parseBody(PermitCreateBody, await request.json().catch(() => null));
	if (!parsed.ok) return parsed.response;
	const data = parsed.data;

	const db = getDb();
	const id = generateId();

	try {
		const txn = db.transaction(() => {
			db.prepare(
				`INSERT INTO permits (id, lab_id, permit_type, name, identifier, issuer,
				                      jurisdiction, document_url, notes, created_by)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
			).run(
				id,
				labId,
				data.permit_type,
				data.name,
				data.identifier ?? null,
				data.issuer ?? null,
				data.jurisdiction ?? null,
				data.document_url ?? null,
				data.notes ?? null,
				user.id
			);

			if (data.project_ids?.length) {
				// Validate every project belongs to this lab before linking.
				assertProjectsInLab(db, data.project_ids, labId);
				setPermitProjects(db, id, data.project_ids);
			}

			if (data.scopes?.length) {
				assertScopeSitesInLab(db, data.scopes, labId);
				const insert = db.prepare(
					`INSERT INTO permit_scopes (id, permit_id, site_id, valid_from, valid_until, notes)
					 VALUES (?, ?, ?, ?, ?, ?)`
				);
				for (const s of data.scopes) {
					insert.run(
						generateId(),
						id,
						s.site_id ?? null,
						s.valid_from ?? null,
						s.valid_until ?? null,
						s.notes ?? null
					);
				}
			}
		});
		txn();

		return json(loadPermitWithLinks(db, id), { status: 201 });
	} catch (err) {
		return apiError(err);
	}
};

// ---------------------------------------------------------------------------

export function loadPermitWithLinks(db: ReturnType<typeof getDb>, permitId: string) {
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

export function assertProjectsInLab(
	db: ReturnType<typeof getDb>,
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

export function assertScopeSitesInLab(
	db: ReturnType<typeof getDb>,
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
