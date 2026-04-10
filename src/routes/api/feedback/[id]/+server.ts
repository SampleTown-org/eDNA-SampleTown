import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { requireAdmin } from '$lib/server/guards';
import { z } from 'zod';
import { parseBody } from '$lib/server/validation';

const FeedbackUpdateBody = z.object({
	status: z.enum(['open', 'resolved', 'wontfix']).optional()
});

/** Admin updates the status of a feedback row (open / resolved / wontfix). */
export const PUT: RequestHandler = async ({ params, request, locals }) => {
	requireAdmin(locals);

	const parsed = parseBody(FeedbackUpdateBody, await request.json().catch(() => null));
	if (!parsed.ok) return parsed.response;

	try {
		const db = getDb();
		const result = db
			.prepare('UPDATE feedback SET status = COALESCE(?, status) WHERE id = ?')
			.run(parsed.data.status ?? null, params.id);
		if (result.changes === 0) throw error(404, 'Feedback not found');
		return json(db.prepare('SELECT * FROM feedback WHERE id = ?').get(params.id));
	} catch (err) {
		return apiError(err);
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
	requireAdmin(locals);
	try {
		const db = getDb();
		db.prepare('DELETE FROM feedback WHERE id = ?').run(params.id);
		return json({ ok: true });
	} catch (err) {
		return apiError(err);
	}
};
