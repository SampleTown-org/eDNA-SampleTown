import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, resolveId } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';

export const GET: RequestHandler = async ({ locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const projects = db
		.prepare('SELECT * FROM projects WHERE lab_id = ? ORDER BY created_at DESC')
		.all(labId);
	return json(projects);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, labId } = requireLab(locals);
	const data = await request.json();
	const db = getDb();
	const id = resolveId(data?.id);

	db.prepare(`
		INSERT INTO projects (id, lab_id, project_name, description, pi_name, institution, contact_email, funding_sources, github_repo, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).run(
		id,
		labId,
		data.project_name,
		data.description,
		data.pi_name,
		data.institution,
		data.contact_email ?? null,
		data.funding_sources ?? null,
		data.github_repo,
		user.id
	);

	const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
	return json(project, { status: 201 });
};
