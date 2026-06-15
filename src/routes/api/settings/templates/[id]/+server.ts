import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { requireLab } from '$lib/server/guards';
import { assertLabOwnsRow } from '$lib/server/lab-scope';
import { serializeParams } from '$lib/server/templates';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	assertLabOwnsRow(db, 'sample_templates', params.id!, labId, 'Template not found');
	const data = await request.json();
	if (!data?.name?.trim()) return json({ error: 'name is required' }, { status: 400 });
	try {
		db.prepare(
			`UPDATE sample_templates
			 SET name = ?, description = ?, mixs_checklist = ?, extension = ?, params = ?,
			     sync_version = sync_version + 1, updated_at = datetime('now')
			 WHERE id = ? AND lab_id = ?`
		).run(
			data.name.trim(),
			data.description?.trim() || null,
			data.mixs_checklist || 'MimarksS',
			data.extension || null,
			serializeParams(data.params),
			params.id,
			labId
		);
		return json(db.prepare('SELECT * FROM sample_templates WHERE id = ?').get(params.id));
	} catch (err) {
		return apiError(err);
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	assertLabOwnsRow(db, 'sample_templates', params.id!, labId, 'Template not found');
	db.prepare(
		"UPDATE sample_templates SET is_deleted = 1, updated_at = datetime('now') WHERE id = ? AND lab_id = ?"
	).run(params.id, labId);
	return json({ ok: true });
};
