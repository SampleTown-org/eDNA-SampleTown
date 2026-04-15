import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';

export const load: PageServerLoad = async ({ locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const projects = db.prepare(`
		SELECT p.*, COUNT(s.id) as sample_count
		FROM projects p
		LEFT JOIN samples s ON s.project_id = p.id AND s.is_deleted = 0
		WHERE p.lab_id = ?
		GROUP BY p.id
		ORDER BY p.created_at DESC
	`).all(labId);
	return { projects };
};
