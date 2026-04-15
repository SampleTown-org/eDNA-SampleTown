import { getDb } from './db';

/**
 * Load active picklist values for one or more categories, scoped to a lab.
 *
 * `labId` is required — every call site is behind a requireLab() gate so
 * there's always a lab to bind against. Cross-lab picklists were the old
 * global behavior; under multi-tenant, each lab maintains its own set.
 */
export function getConstrainedValues(
	labId: string,
	...categories: string[]
): Record<string, { value: string; label: string }[]> {
	const db = getDb();
	const result: Record<string, { value: string; label: string }[]> = {};
	for (const cat of categories) {
		const rows = db
			.prepare(
				'SELECT value, label FROM constrained_values WHERE lab_id = ? AND category = ? AND is_active = 1 ORDER BY sort_order, value'
			)
			.all(labId, cat) as { value: string; label: string | null }[];
		result[cat] = rows.map((r) => ({ value: r.value, label: r.label || r.value }));
	}
	return result;
}
