import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { apiError, badRequest } from '$lib/server/api-errors';
import { requireLab } from '$lib/server/guards';
import { assertLabOwnsRow } from '$lib/server/lab-scope';
import { parseBody } from '$lib/server/validation';
import { AddCartToPermitBody } from '$lib/server/schemas/permits';
import { upsertPermitScope } from '$lib/server/permit-coverage';
import { loadPermitWithScopes } from '$lib/server/permits-helpers';

/**
 * POST /api/permits/add-cart
 *
 * Bulk-link a saved cart to an existing permit. For each cart item:
 *   - entity_type='site' contributes its site_id
 *   - entity_type='sample' contributes the sample's site_id (resolved)
 *   - any other entity_type is ignored silently
 *
 * Unique site_ids are upserted into permit_scopes with the caller's supplied
 * date window. Re-running with the same cart + permit is a no-op (upsert on
 * (permit_id, site_id)).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const { labId } = requireLab(locals);
	const parsed = parseBody(AddCartToPermitBody, await request.json().catch(() => null));
	if (!parsed.ok) return parsed.response;
	const { permit_id, cart_id, valid_from, valid_until } = parsed.data;

	const db = getDb();
	try {
		assertLabOwnsRow(db, 'permits', permit_id, labId, 'Permit not found');
		assertLabOwnsRow(db, 'saved_carts', cart_id, labId, 'Cart not found');

		// Pull every site referenced in the cart — directly (entity_type='site')
		// or indirectly via sample→site. One query with UNION so we don't round
		// trip per item. Filtered by lab_id at every join.
		const siteRows = db
			.prepare(
				`
          SELECT DISTINCT s.id AS site_id, s.site_name
            FROM saved_cart_items ci
            JOIN sites s ON s.id = ci.entity_id AND s.lab_id = ?
           WHERE ci.cart_id = ? AND ci.entity_type = 'site' AND s.is_deleted = 0
           UNION
          SELECT DISTINCT s.id AS site_id, s.site_name
            FROM saved_cart_items ci
            JOIN samples sa ON sa.id = ci.entity_id AND sa.lab_id = ? AND sa.is_deleted = 0
            JOIN sites s ON s.id = sa.site_id AND s.lab_id = ?
           WHERE ci.cart_id = ? AND ci.entity_type = 'sample' AND s.is_deleted = 0
        `
			)
			.all(labId, cart_id, labId, labId, cart_id) as Array<{
			site_id: string;
			site_name: string;
		}>;

		if (siteRows.length === 0) {
			badRequest('Cart has no sites or samples in your lab');
		}

		const txn = db.transaction(() => {
			for (const { site_id } of siteRows) {
				upsertPermitScope(db, {
					permit_id,
					site_id,
					valid_from: valid_from ?? null,
					valid_until: valid_until ?? null,
					notes: null
				});
			}
		});
		txn();

		return json({
			ok: true,
			sites_linked: siteRows.length,
			permit: loadPermitWithScopes(db, permit_id)
		});
	} catch (err) {
		return apiError(err);
	}
};
