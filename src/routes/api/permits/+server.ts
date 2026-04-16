import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { requireLab } from '$lib/server/guards';
import { parseBody } from '$lib/server/validation';
import { PermitCreateBody } from '$lib/server/schemas/permits';
import { replacePermitScopes } from '$lib/server/permit-coverage';
import { assertSitesInLab, loadPermitWithScopes } from '$lib/server/permits-helpers';

/**
 * GET /api/permits
 *
 * Cross-cutting list for the Settings "Permits" tab. Each permit is returned
 * with its scope rows (joined with site_name + project_id so the UI can
 * render a rollup of covered sites/projects without a second fetch).
 *
 * Query params:
 *   ?site_id=<id>    — only return permits with a scope row for this site.
 *                      Used by the site detail page to show "permits covering
 *                      this site" without bulk-loading every permit.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const siteFilter = url.searchParams.get('site_id');

	let permits: Array<{ id: string }>;
	if (siteFilter) {
		permits = db
			.prepare(
				`SELECT DISTINCT p.*
				   FROM permits p
				   JOIN permit_scopes ps ON ps.permit_id = p.id
				  WHERE p.lab_id = ? AND ps.site_id = ?
				  ORDER BY p.created_at DESC`
			)
			.all(labId, siteFilter) as Array<{ id: string }>;
	} else {
		permits = db
			.prepare('SELECT * FROM permits WHERE lab_id = ? ORDER BY created_at DESC')
			.all(labId) as Array<{ id: string }>;
	}

	if (permits.length === 0) return json([]);

	const ids = permits.map((p) => p.id);
	const placeholders = ids.map(() => '?').join(',');

	// Single batched query for every scope row with site + project metadata.
	const scopes = db
		.prepare(
			`SELECT ps.*, s.site_name, s.project_id, pr.project_name
			   FROM permit_scopes ps
			   JOIN sites    s  ON s.id  = ps.site_id
			   JOIN projects pr ON pr.id = s.project_id
			  WHERE ps.permit_id IN (${placeholders})
			  ORDER BY s.site_name`
		)
		.all(...ids) as Array<{ permit_id: string }>;

	const byPermit = new Map<string, unknown[]>();
	for (const s of scopes) {
		const arr = byPermit.get(s.permit_id) ?? [];
		arr.push(s);
		byPermit.set(s.permit_id, arr);
	}

	return json(permits.map((p) => ({ ...p, scopes: byPermit.get(p.id) ?? [] })));
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

			if (data.scopes?.length) {
				assertSitesInLab(db, data.scopes.map((s) => s.site_id), labId);
				replacePermitScopes(
					db,
					id,
					data.scopes.map((s) => ({
						site_id: s.site_id,
						valid_from: s.valid_from ?? null,
						valid_until: s.valid_until ?? null,
						notes: s.notes ?? null
					}))
				);
			}
		});
		txn();

		return json(loadPermitWithScopes(db, id), { status: 201 });
	} catch (err) {
		return apiError(err);
	}
};
