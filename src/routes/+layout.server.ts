import type { LayoutServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: LayoutServerLoad = async ({ locals }) => {
	const db = getDb();
	const namingRows = db.prepare("SELECT value, label FROM constrained_values WHERE category = 'naming_template' AND is_active = 1").all() as { value: string; label: string }[];
	const namingTemplates: Record<string, string> = {};
	for (const r of namingRows) namingTemplates[r.value] = r.label || '';

	return {
		user: locals.user,
		namingTemplates
	};
};
