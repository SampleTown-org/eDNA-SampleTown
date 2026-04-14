import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { findEntityById } from '$lib/server/id-lookup';

/** JSON lookup: `{ type, id }` if the UUID is claimed, or 404. */
export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const found = findEntityById(db, params.uuid);
	if (!found) return json({ error: 'Not found' }, { status: 404 });
	return json(found);
};
