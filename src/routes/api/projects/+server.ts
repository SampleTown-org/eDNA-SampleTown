import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';

export const GET: RequestHandler = async () => {
	const db = getDb();
	const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all();
	return json(projects);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const data = await request.json();
	const db = getDb();
	const id = generateId();

	db.prepare(`
		INSERT INTO projects (id, project_name, description, pi_name, institution, github_repo, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`).run(id, data.project_name, data.description, data.pi_name, data.institution, data.github_repo, locals.user?.id ?? null);

	const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
	return json(project, { status: 201 });
};
