import { getDb } from './db';

export function getActivePersonnel(): { id: string; full_name: string; role: string | null }[] {
	const db = getDb();
	return db.prepare('SELECT id, full_name, role FROM personnel WHERE is_active = 1 ORDER BY sort_order, full_name').all() as any[];
}
