import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();
	const extract = db.prepare('SELECT * FROM extracts WHERE id = ? AND is_deleted = 0').get(params.extractId);
	if (!extract) throw error(404, 'Extract not found');
	return { extract };
};
