import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { requireUser } from '$lib/server/guards';
import { apiError } from '$lib/server/api-errors';

interface CartRow {
	id: string;
	user_id: string;
	name: string;
	is_public: number;
	created_at: string;
	updated_at: string;
}

function loadCart(id: string): CartRow {
	const db = getDb();
	const row = db.prepare(
		'SELECT id, user_id, name, is_public, created_at, updated_at FROM saved_carts WHERE id = ?'
	).get(id) as CartRow | undefined;
	if (!row) throw error(404, 'Cart not found');
	return row;
}

export const GET: RequestHandler = async ({ params, locals }) => {
	const user = requireUser(locals);
	const cart = loadCart(params.id);
	if (cart.user_id !== user.id && cart.is_public !== 1) {
		throw error(403, 'Not your cart');
	}
	const db = getDb();
	const items = db.prepare(
		`SELECT entity_type AS type, entity_id AS id, label, sublabel
		 FROM saved_cart_items WHERE cart_id = ? ORDER BY position`
	).all(params.id);
	return json({ ...cart, items });
};

/** Rename or toggle public. Owner only. */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const user = requireUser(locals);
	try {
		const cart = loadCart(params.id);
		if (cart.user_id !== user.id) throw error(403, 'Not your cart');
		const body = await request.json();
		const name = typeof body?.name === 'string' ? body.name.trim() : cart.name;
		if (!name) return json({ error: 'Name is required' }, { status: 400 });
		if (name.length > 120) return json({ error: 'Name is too long' }, { status: 400 });
		const isPublic = body?.is_public != null ? (body.is_public ? 1 : 0) : cart.is_public;
		const db = getDb();
		db.prepare(
			`UPDATE saved_carts SET name = ?, is_public = ?, updated_at = datetime('now') WHERE id = ?`
		).run(name, isPublic, params.id);
		return json({ ok: true });
	} catch (err) {
		return apiError(err);
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const user = requireUser(locals);
	try {
		const cart = loadCart(params.id);
		if (cart.user_id !== user.id) throw error(403, 'Not your cart');
		const db = getDb();
		db.prepare('DELETE FROM saved_carts WHERE id = ?').run(params.id);
		return json({ ok: true });
	} catch (err) {
		return apiError(err);
	}
};
