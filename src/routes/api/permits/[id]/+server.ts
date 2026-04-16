import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { requireLab } from '$lib/server/guards';
import { assertLabOwnsRow } from '$lib/server/lab-scope';
import { parseBody } from '$lib/server/validation';
import { PermitUpdateBody } from '$lib/server/schemas/permits';
import { setPermitProjects } from '$lib/server/permit-coverage';
import {
	assertProjectsInLab,
	assertScopeSitesInLab,
	loadPermitWithLinks
} from '$lib/server/permits-helpers';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	assertLabOwnsRow(db, 'permits', params.id!, labId, 'Permit not found');
	return json(loadPermitWithLinks(db, params.id!));
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const { labId } = requireLab(locals);
	const parsed = parseBody(PermitUpdateBody, await request.json().catch(() => null));
	if (!parsed.ok) return parsed.response;
	const data = parsed.data;

	const db = getDb();
	try {
		assertLabOwnsRow(db, 'permits', params.id!, labId, 'Permit not found');

		const txn = db.transaction(() => {
			db.prepare(
				`UPDATE permits
				    SET permit_type = ?, name = ?, identifier = ?, issuer = ?,
				        jurisdiction = ?, document_url = ?, notes = ?,
				        updated_at = datetime('now')
				  WHERE id = ?`
			).run(
				data.permit_type,
				data.name,
				data.identifier ?? null,
				data.issuer ?? null,
				data.jurisdiction ?? null,
				data.document_url ?? null,
				data.notes ?? null,
				params.id
			);

			// Replace-on-update for project links. Simpler than diffing and the
			// list is tiny (single-digit entries typical).
			if (data.project_ids !== undefined) {
				assertProjectsInLab(db, data.project_ids, labId);
				setPermitProjects(db, params.id!, data.project_ids);
			}

			// Same approach for scopes — delete then re-insert. OK because scopes
			// don't have outbound references; losing scope ids on edit is fine.
			if (data.scopes !== undefined) {
				assertScopeSitesInLab(db, data.scopes, labId);
				db.prepare('DELETE FROM permit_scopes WHERE permit_id = ?').run(params.id);
				const insert = db.prepare(
					`INSERT INTO permit_scopes (id, permit_id, site_id, valid_from, valid_until, notes)
					 VALUES (?, ?, ?, ?, ?, ?)`
				);
				for (const s of data.scopes) {
					insert.run(
						generateId(),
						params.id,
						s.site_id ?? null,
						s.valid_from ?? null,
						s.valid_until ?? null,
						s.notes ?? null
					);
				}
			}
		});
		txn();

		return json(loadPermitWithLinks(db, params.id!));
	} catch (err) {
		return apiError(err);
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	assertLabOwnsRow(db, 'permits', params.id!, labId, 'Permit not found');
	// ON DELETE CASCADE on permit_projects / permit_scopes takes care of children.
	db.prepare('DELETE FROM permits WHERE id = ?').run(params.id);
	return json({ ok: true });
};
