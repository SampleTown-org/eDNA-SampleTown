import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { parseBody } from '$lib/server/validation';
import { PersonnelUpdateBody } from '$lib/server/schemas/auth';

export const PUT: RequestHandler = async ({ params, request }) => {
	const parsed = parseBody(PersonnelUpdateBody, await request.json().catch(() => null));
	if (!parsed.ok) return parsed.response;
	const data = parsed.data;

	const db = getDb();
	try {
		db.prepare(
			`UPDATE personnel
			   SET full_name = ?, email = ?, role = ?, institution = ?,
			       orcid = ?, user_id = ?, is_active = ?, sort_order = ?
			 WHERE id = ?`
		).run(
			data.full_name,
			data.email ?? null,
			data.role ?? null,
			data.institution ?? null,
			data.orcid ?? null,
			data.user_id ?? null,
			data.is_active,
			data.sort_order,
			params.id
		);
		return json(
			db
				.prepare(
					'SELECT p.*, u.username AS github_username FROM personnel p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?'
				)
				.get(params.id)
		);
	} catch (err) {
		return apiError(err);
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	const db = getDb();
	db.prepare('DELETE FROM personnel WHERE id = ?').run(params.id);
	return json({ ok: true });
};
