import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getEntityPersonnel } from '$lib/server/entity-personnel';
import { loadSampleValues } from '$lib/server/sample-body';

export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();

	const sampleRow = db.prepare(`
		SELECT s.*, p.project_name, st.site_name,
			st.lat_lon, st.latitude, st.longitude, st.geo_loc_name,
			st.env_broad_scale, st.env_local_scale
		FROM samples s
		JOIN projects p ON p.id = s.project_id
		JOIN sites st ON st.id = s.site_id
		WHERE s.id = ? AND s.is_deleted = 0
	`).get(params.sampleId) as Record<string, unknown> | undefined;
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

	return { sample, extracts, people };
};
