import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';

export const GET: RequestHandler = async () => {
	const db = getDb();
	const items = db.prepare('SELECT * FROM feedback ORDER BY created_at DESC').all();
	return json(items);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const data = await request.json();
	const db = getDb();
	const id = generateId();
	db.prepare('INSERT INTO feedback (id, page_url, message, user_id, username) VALUES (?, ?, ?, ?, ?)').run(
		id, data.page_url || '', data.message, locals.user?.id ?? null, locals.user?.username ?? data.username ?? 'anonymous'
	);
	return json({ id }, { status: 201 });
};
