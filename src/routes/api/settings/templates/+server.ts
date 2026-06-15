import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { requireLab } from '$lib/server/guards';
import { serializeParams } from '$lib/server/templates';

export const GET: RequestHandler = async ({ locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	return json(
		db
			.prepare(
				`SELECT id, name, description, mixs_checklist, extension, params
				 FROM sample_templates WHERE lab_id = ? AND is_deleted = 0 ORDER BY name`
			)
			.all(labId)
	);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const { user, labId } = requireLab(locals);
	const data = await request.json();
	if (!data?.name?.trim()) return json({ error: 'name is required' }, { status: 400 });
	const db = getDb();
	const id = generateId();
	try {
		db.prepare(
			`INSERT INTO sample_templates (id, lab_id, name, description, mixs_checklist, extension, params, created_by)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		).run(
			id,
			labId,
			data.name.trim(),
			data.description?.trim() || null,
			data.mixs_checklist || 'MimarksS',
			data.extension || null,
			serializeParams(data.params),
			user.id
		);
		return json(db.prepare('SELECT * FROM sample_templates WHERE id = ?').get(id), { status: 201 });
	} catch (err) {
		return apiError(err);
	}
};
