import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { requireLab } from '$lib/server/guards';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const category = url.searchParams.get('category');
	if (category) {
		return json(
			db
				.prepare(
					'SELECT * FROM constrained_values WHERE lab_id = ? AND category = ? AND is_active = 1 ORDER BY sort_order, value'
				)
				.all(labId, category)
		);
	}
	return json(
		db
			.prepare(
				'SELECT * FROM constrained_values WHERE lab_id = ? ORDER BY category, sort_order, value'
			)
			.all(labId)
	);
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const { labId } = requireLab(locals);
	const data = await request.json();
	const db = getDb();
	const id = generateId();
	try {
		const maxOrder = db
			.prepare(
				'SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM constrained_values WHERE lab_id = ? AND category = ?'
			)
			.get(labId, data.category) as any;
		db.prepare(
			'INSERT INTO constrained_values (id, lab_id, category, value, label, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
		).run(
			id,
			labId,
			data.category,
			data.value,
			data.label || null,
			data.sort_order ?? maxOrder.next
		);
		return json(db.prepare('SELECT * FROM constrained_values WHERE id = ?').get(id), { status: 201 });
	} catch (err) {
		return apiError(err);
	}
};
