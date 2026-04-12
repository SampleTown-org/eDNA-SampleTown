import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { attachPeopleSummary } from '$lib/server/entity-personnel';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const samples = db.prepare(`
		SELECT s.*, p.project_name, st.site_name, st.geo_loc_name, st.lat_lon,
			st.latitude, st.longitude, st.env_broad_scale, st.env_local_scale
		FROM samples s
		JOIN projects p ON p.id = s.project_id
		JOIN sites st ON st.id = s.site_id
		WHERE s.is_deleted = 0
		ORDER BY s.created_at DESC
	`).all() as { id: string }[];

	const samplesWithPeople = attachPeopleSummary('sample', samples);
	const projects = db.prepare('SELECT id, project_name FROM projects ORDER BY project_name').all();

	return { samples: samplesWithPeople, projects };
};
