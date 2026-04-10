import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const projects = db.prepare('SELECT id, project_name FROM projects ORDER BY project_name').all();
	return { projects };
};
