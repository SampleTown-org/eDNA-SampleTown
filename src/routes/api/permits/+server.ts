import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { requireLab } from '$lib/server/guards';
import { parseBody } from '$lib/server/validation';
import { PermitCreateBody } from '$lib/server/schemas/permits';
import { setPermitProjects } from '$lib/server/permit-coverage';
import {
	assertProjectsInLab,
	assertScopeSitesInLab,
	loadPermitWithLinks
} from '$lib/server/permits-helpers';

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

