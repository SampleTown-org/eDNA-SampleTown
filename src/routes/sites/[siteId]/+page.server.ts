import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();

	const site = db.prepare(`
		SELECT s.*, p.project_name
		FROM sites s
		JOIN projects p ON p.id = s.project_id
		WHERE s.id = ? AND s.is_deleted = 0 AND s.lab_id = ?
	`).get(params.siteId, labId);
	if (!site) throw error(404, 'Site not found');

	const samples = db.prepare(`
		SELECT s.*, p.project_name
		FROM samples s
		JOIN projects p ON p.id = s.project_id
		WHERE s.site_id = ? AND s.is_deleted = 0
		ORDER BY s.collection_date DESC
	`).all(params.siteId);

	const photos = db.prepare(`
		SELECT id, filename, original_filename, mime_type, size_bytes, caption, created_at
		FROM site_photos
		WHERE site_id = ? AND is_deleted = 0
		ORDER BY created_at DESC
	`).all(params.siteId);

	// Permits with scope rows that name this site (explicitly) and permits
	// whose scopes are site-agnostic (site_id IS NULL) but still cover this
	// project. The unioned result gives the operator a single list to look at.
	const siteRow = site as { project_id: string };
	const permits = db
		.prepare(
			`SELECT DISTINCT p.*
			   FROM permits p
			   JOIN permit_projects pp ON pp.permit_id = p.id
			   JOIN permit_scopes   ps ON ps.permit_id = p.id
			  WHERE p.lab_id = ?
			    AND pp.project_id = ?
			    AND (ps.site_id = ? OR ps.site_id IS NULL)
			  ORDER BY p.name`
		)
		.all(labId, siteRow.project_id, params.siteId);

	return { site, samples, photos, permits };
};
