import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const project = db
		.prepare('SELECT * FROM projects WHERE id = ? AND lab_id = ?')
		.get(params.projectId, labId);
	if (!project) throw error(404, 'Project not found');
	return { project };
};
