import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { requireLab } from '$lib/server/guards';
import { assertLabOwnsRow } from '$lib/server/lab-scope';
import { parseBody } from '$lib/server/validation';
import { PermitUpdateBody } from '$lib/server/schemas/permits';
import { replacePermitScopes } from '$lib/server/permit-coverage';
import { assertSitesInLab, loadPermitWithScopes } from '$lib/server/permits-helpers';

export const GET: RequestHandler = async ({ params, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	assertLabOwnsRow(db, 'permits', params.id!, labId, 'Permit not found');
	return json(loadPermitWithScopes(db, params.id!));
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

			// Replace-on-update for scopes (caller sends the full desired set).
			if (data.scopes !== undefined) {
				assertSitesInLab(db, data.scopes.map((s) => s.site_id), labId);
				replacePermitScopes(
					db,
					params.id!,
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

		return json(loadPermitWithScopes(db, params.id!));
	} catch (err) {
		return apiError(err);
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	assertLabOwnsRow(db, 'permits', params.id!, labId, 'Permit not found');
	// ON DELETE CASCADE on permit_scopes takes care of child rows.
	db.prepare('DELETE FROM permits WHERE id = ?').run(params.id);
	return json({ ok: true });
};
