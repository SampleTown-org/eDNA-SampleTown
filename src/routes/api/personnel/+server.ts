import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { parseBody } from '$lib/server/validation';
import { PersonnelCreateBody } from '$lib/server/schemas/auth';

export const GET: RequestHandler = async ({ url }) => {
	const db = getDb();
	const activeOnly = url.searchParams.get('active') !== '0';
	const query = activeOnly
		? 'SELECT p.*, u.username AS github_username, u.avatar_url FROM personnel p LEFT JOIN users u ON u.id = p.user_id WHERE p.is_active = 1 ORDER BY p.sort_order, p.full_name'
		: 'SELECT p.*, u.username AS github_username, u.avatar_url FROM personnel p LEFT JOIN users u ON u.id = p.user_id ORDER BY p.sort_order, p.full_name';
	return json(db.prepare(query).all());
};

export const POST: RequestHandler = async ({ request }) => {
	const parsed = parseBody(PersonnelCreateBody, await request.json().catch(() => null));
	if (!parsed.ok) return parsed.response;
	const data = parsed.data;

	const db = getDb();
	const id = generateId();
	try {
		db.prepare(
			`INSERT INTO personnel (id, full_name, email, role, institution, orcid, user_id, sort_order)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		).run(
			id,
			data.full_name,
			data.email ?? null,
			data.role ?? null,
			data.institution ?? null,
			data.orcid ?? null,
			data.user_id ?? null,
			data.sort_order
		);
		return json(
			db
				.prepare(
					'SELECT p.*, u.username AS github_username FROM personnel p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ?'
				)
				.get(id),
			{ status: 201 }
		);
	} catch (err) {
		return apiError(err);
	}
};
