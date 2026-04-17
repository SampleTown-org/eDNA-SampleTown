import type { LayoutServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: LayoutServerLoad = async ({ locals }) => {
	const db = getDb();
	const namingRows = db.prepare("SELECT value, label FROM constrained_values WHERE category = 'naming_template' AND is_active = 1").all() as { value: string; label: string }[];
	const namingTemplates: Record<string, string> = {};
	for (const r of namingRows) namingTemplates[r.value] = r.label || '';

	// Lab info threaded through the layout so every page can prefix its h1
	// with the active lab's name (e.g. "Cryomics Lab Sites"). Null when the
	// caller isn't logged in or hasn't been assigned a lab yet — pages
	// gracefully degrade to no prefix.
	let lab: { id: string; name: string; slug: string } | null = null;
	if (locals.user?.lab_id) {
		lab = db
			.prepare('SELECT id, name, slug FROM labs WHERE id = ?')
			.get(locals.user.lab_id) as { id: string; name: string; slug: string } | null;
	}

	// All labs the user belongs to (for the navbar lab-switcher).
	const labs: { id: string; name: string; slug: string; role: string }[] = locals.user
		? (db
				.prepare(
					`SELECT l.id, l.name, l.slug, m.role
					 FROM lab_memberships m
					 JOIN labs l ON l.id = m.lab_id
					 WHERE m.user_id = ? AND m.status = 'active'
					 ORDER BY l.name`
				)
				.all(locals.user.id) as { id: string; name: string; slug: string; role: string }[])
		: [];

	return {
		user: locals.user,
		namingTemplates,
		lab,
		labs
	};
};
