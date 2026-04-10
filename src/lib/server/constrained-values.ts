import { getDb } from './db';

export function getConstrainedValues(...categories: string[]): Record<string, { value: string; label: string }[]> {
	const db = getDb();
	const result: Record<string, { value: string; label: string }[]> = {};
	for (const cat of categories) {
		const rows = db.prepare('SELECT value, label FROM constrained_values WHERE category = ? AND is_active = 1 ORDER BY sort_order, value').all(cat) as { value: string; label: string | null }[];
		result[cat] = rows.map(r => ({ value: r.value, label: r.label || r.value }));
	}
	return result;
}
