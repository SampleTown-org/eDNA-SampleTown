import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();
	const pcr = db.prepare('SELECT * FROM pcr_amplifications WHERE id = ? AND is_deleted = 0').get(params.pcrId);
	if (!pcr) throw error(404, 'PCR not found');
	return { pcr };
};
