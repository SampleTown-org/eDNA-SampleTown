import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';
import { apiError } from '$lib/server/api-errors';

/**
 * GET /api/saved-carts
 * Returns carts the current user owns + public carts from everyone else in
 * the same lab. Public carts are lab-scoped: another lab's public carts are
 * invisible.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const { user, labId } = requireLab(locals);
	const db = getDb();
	const rows = db.prepare(`
		SELECT sc.id, sc.name, sc.is_public, sc.created_at, sc.updated_at,
			sc.user_id,
			u.username AS owner_username,
			u.display_name AS owner_display_name,
			u.avatar_emoji AS owner_avatar,
			(SELECT COUNT(*) FROM saved_cart_items WHERE cart_id = sc.id) AS item_count
		FROM saved_carts sc
		LEFT JOIN users u ON u.id = sc.user_id
		WHERE sc.lab_id = ? AND (sc.user_id = ? OR sc.is_public = 1)
		ORDER BY sc.updated_at DESC
	`).all(labId, user.id);
	return json(rows);
};

/**
 * POST /api/saved-carts
 * Body: { name, is_public?, items: [{ type, id, label?, sublabel? }] }
 * Creates a new saved cart for the current user.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, labId } = requireLab(locals);
	try {
		const body = await request.json();
		const name = typeof body?.name === 'string' ? body.name.trim() : '';
		if (!name) return json({ error: 'Name is required' }, { status: 400 });
		if (name.length > 120) return json({ error: 'Name is too long' }, { status: 400 });
		const items = Array.isArray(body?.items) ? body.items : [];
		if (items.length === 0) {
			return json({ error: 'Cart is empty' }, { status: 400 });
		}
		const isPublic = body?.is_public ? 1 : 0;

		const db = getDb();
		const id = generateId();
		const insertCart = db.prepare(
			`INSERT INTO saved_carts (id, lab_id, user_id, name, is_public) VALUES (?, ?, ?, ?, ?)`
		);
		const insertItem = db.prepare(
			`INSERT INTO saved_cart_items (cart_id, position, entity_type, entity_id, label, sublabel)
			 VALUES (?, ?, ?, ?, ?, ?)`
		);
		const tx = db.transaction(() => {
			insertCart.run(id, labId, user.id, name, isPublic);
			items.forEach((it: { type?: string; id?: string; label?: string; sublabel?: string }, i: number) => {
				if (!it?.type || !it?.id) return;
				insertItem.run(id, i, it.type, it.id, it.label ?? null, it.sublabel ?? null);
			});
		});
		tx();
		return json({ id, name, is_public: isPublic }, { status: 201 });
	} catch (err) {
		return apiError(err);
	}
};
