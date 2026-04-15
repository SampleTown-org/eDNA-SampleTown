import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { findEntityById } from '$lib/server/id-lookup';
import { requireLab } from '$lib/server/guards';

/** JSON lookup: `{ type, id }` if the UUID is claimed in THIS lab, or 404.
 *  Rows in other labs return 404 so the scanner can't enumerate cross-lab ids. */
export const GET: RequestHandler = async ({ params, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const found = findEntityById(db, params.uuid, labId);
	if (!found) return json({ error: 'Not found' }, { status: 404 });
	return json(found);
};
