import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();
	const library = db.prepare('SELECT * FROM library_preps WHERE id = ? AND is_deleted = 0').get(params.libraryId);
	if (!library) throw error(404, 'Library not found');
	return { library };
};
