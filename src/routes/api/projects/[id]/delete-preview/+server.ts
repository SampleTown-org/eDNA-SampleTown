import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { apiError } from '$lib/server/api-errors';
import { requireLab } from '$lib/server/guards';
import { assertLabOwnsRow } from '$lib/server/lab-scope';
import { projectDeleteCounts } from '$lib/server/project-delete';

/**
 * What deleting this project would remove, by table.
 *
 * Deleting a project is the one hard delete in the app — everything else sets
 * is_deleted — so the confirmation needs to say what is actually at stake, not
 * just the sample count. Counted from the same SQL the delete uses.
 *
 *   GET /api/projects/[id]/delete-preview
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const { labId } = requireLab(locals);
		const db = getDb();
		assertLabOwnsRow(db, 'projects', params.id!, labId, 'Project not found');
		return json(projectDeleteCounts(db, params.id!));
	} catch (err) {
		return apiError(err);
	}
};
