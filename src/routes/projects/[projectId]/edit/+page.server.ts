import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();
	const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(params.projectId);
	if (!project) throw error(404, 'Project not found');
	return { project };
};
