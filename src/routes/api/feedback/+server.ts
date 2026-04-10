import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb, generateId } from '$lib/server/db';
import { checkRate } from '$lib/server/rate-limit';
import { apiError } from '$lib/server/api-errors';

const MAX_MESSAGE_LEN = 2000;
const MAX_URL_LEN = 500;

// Admin-only via hooks.server.ts (GET /api/feedback is in ADMIN_WRITE_PREFIXES list).
export const GET: RequestHandler = async () => {
	const db = getDb();
	const items = db.prepare('SELECT * FROM feedback ORDER BY created_at DESC').all();
	return json(items);
};

// Anonymous POSTs allowed via hooks.server.ts PUBLIC_API_ROUTES allowlist.
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
	try {
		// Rate limit per IP: 5 submissions / minute
		const ip = getClientAddress();
		if (!checkRate(`feedback:${ip}`, 5, 60_000)) {
			return json({ error: 'Too many feedback submissions, try again in a moment' }, { status: 429 });
		}

		const data = await request.json();
		const message = String(data?.message ?? '').trim();
		const pageUrl = String(data?.page_url ?? '').slice(0, MAX_URL_LEN);

		if (!message) {
			return json({ error: 'message is required' }, { status: 400 });
		}
		if (message.length > MAX_MESSAGE_LEN) {
			return json({ error: `message must be at most ${MAX_MESSAGE_LEN} chars` }, { status: 400 });
		}

		const db = getDb();
		const id = generateId();
		db.prepare(
			'INSERT INTO feedback (id, page_url, message, user_id, username) VALUES (?, ?, ?, ?, ?)'
		).run(id, pageUrl, message, locals.user?.id ?? null, locals.user?.username ?? 'anonymous');
		return json({ id }, { status: 201 });
	} catch (err) {
		return apiError(err);
	}
};
