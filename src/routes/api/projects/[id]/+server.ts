import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';

const nn = (v: unknown): unknown => (typeof v === 'string' && v.trim() === '' ? null : v);

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(params.id);
	if (!row) throw error(404, 'Project not found');
	return json(row);
};

export const PUT: RequestHandler = async ({ params, request }) => {
	try {
		const data = await request.json();
		if (!data?.project_name?.trim()) {
			return json({ error: 'project_name is required' }, { status: 400 });
		}
		const db = getDb();
		db.prepare(
			`UPDATE projects SET
				project_name = ?, description = ?, pi_name = ?, institution = ?,
				github_repo = ?, updated_at = datetime('now')
			 WHERE id = ?`
		).run(
			data.project_name.trim(),
			nn(data.description),
			nn(data.pi_name),
			nn(data.institution),
			nn(data.github_repo),
			params.id
		);
		return json(db.prepare('SELECT * FROM projects WHERE id = ?').get(params.id));
	} catch (err) {
		return apiError(err);
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const db = getDb();
		db.prepare('DELETE FROM projects WHERE id = ?').run(params.id);
		return json({ ok: true });
	} catch (err) {
		return apiError(err);
	}
};
