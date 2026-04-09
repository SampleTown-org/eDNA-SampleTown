import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const row = db.prepare('SELECT * FROM library_preps WHERE id = ? AND is_deleted = 0').get(params.id);
	if (!row) throw error(404, 'Library prep not found');
	return json(row);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const db = getDb();
	db.prepare("UPDATE library_preps SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?").run(params.id);
	return json({ ok: true });
};
