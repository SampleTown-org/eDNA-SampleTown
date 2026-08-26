import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';
import { getEntityPersonnel } from '$lib/server/entity-personnel';
import { loadSampleValues } from '$lib/server/sample-body';
import { permitsCoveringSample } from '$lib/server/permit-coverage';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();

	const sampleRow = db.prepare(`
		SELECT s.*, p.project_name, st.site_name,
			st.lat_lon, st.latitude, st.longitude, st.geo_loc_name,
			st.env_broad_scale, st.env_local_scale,
			st.is_location_sensitive AS site_is_location_sensitive
		FROM samples s
		JOIN projects p ON p.id = s.project_id
		JOIN sites st ON st.id = s.site_id
		WHERE s.id = ? AND s.is_deleted = 0 AND s.lab_id = ?
	`).get(params.sampleId, labId) as Record<string, unknown> | undefined;
	if (!sampleRow) throw error(404, 'Sample not found');

	// Spread sample_values onto the sample object — gives the detail page
	// every EAV-stored slot (silicate, ammonium, misc_param:*, …) without
	// the page having to know about the EAV table.
	const values = loadSampleValues(db, params.sampleId);
	const sample = { ...sampleRow, ...values };

	const extracts = db.prepare(`
		SELECT * FROM extracts WHERE sample_id = ? AND is_deleted = 0 ORDER BY created_at DESC
	`).all(params.sampleId);

	const people = getEntityPersonnel('sample', params.sampleId);

	const photos = db.prepare(`
		SELECT id, filename, original_filename, mime_type, size_bytes, caption, created_at
		FROM sample_photos
		WHERE sample_id = ? AND is_deleted = 0
		ORDER BY created_at DESC
	`).all(params.sampleId);

	// Permits that cover this sample (by site + collection_date window).
	// Empty array = uncovered, which the detail page flags to prompt operators.
	const coveringPermits = permitsCoveringSample(db, {
		labId,
		siteId: sampleRow.site_id as string,
		collectionDate: sampleRow.collection_date as string
	});

	return { sample, extracts, people, photos, coveringPermits };
};
