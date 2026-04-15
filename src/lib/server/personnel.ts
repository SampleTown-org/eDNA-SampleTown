import { getDb } from './db';

/**
 * Active personnel roster for a given lab. `labId` is required — every call
 * site is behind a requireLab() guard so there's always a caller lab to bind.
 */
export function getActivePersonnel(
	labId: string
): { id: string; full_name: string; role: string | null }[] {
	const db = getDb();
	return db
		.prepare(
			'SELECT id, full_name, role FROM personnel WHERE lab_id = ? AND is_active = 1 ORDER BY sort_order, full_name'
		)
		.all(labId) as any[];
}
