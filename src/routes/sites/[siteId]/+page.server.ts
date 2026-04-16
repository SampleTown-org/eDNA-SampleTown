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

	// Permits covering this site (scope rows matching this site_id). The
	// scope row itself — its date window — travels with the permit so the UI
	// can show (+ edit) the validity period inline.
	const permits = db
		.prepare(
			`SELECT p.*, ps.id AS scope_id, ps.valid_from, ps.valid_until, ps.notes AS scope_notes
			   FROM permits p
			   JOIN permit_scopes ps ON ps.permit_id = p.id
			  WHERE p.lab_id = ? AND ps.site_id = ?
			  ORDER BY p.name`
		)
		.all(labId, params.siteId);

	// Lightweight list of every permit in the lab — used by the
	// "add existing permit to this site" picker on the site detail page.
	const labPermits = db
		.prepare('SELECT id, name, permit_type, identifier FROM permits WHERE lab_id = ? ORDER BY name')
		.all(labId);

	return { site, samples, photos, permits, labPermits };
};
