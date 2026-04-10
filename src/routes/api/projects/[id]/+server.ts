import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(params.id);
	if (!row) throw error(404, 'Project not found');
	return json(row);
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const data = await request.json();
	const db = getDb();
	db.prepare(`
		UPDATE projects SET project_name = ?, description = ?, pi_name = ?, institution = ?,
			github_repo = ?, updated_at = datetime('now')
		WHERE id = ?
	`).run(data.project_name, data.description ?? null, data.pi_name ?? null,
		data.institution ?? null, data.github_repo ?? null, params.id);
	return json(db.prepare('SELECT * FROM projects WHERE id = ?').get(params.id));
};

export const DELETE: RequestHandler = async ({ params }) => {
	const db = getDb();
	db.prepare('DELETE FROM projects WHERE id = ?').run(params.id);
	return json({ ok: true });
};
