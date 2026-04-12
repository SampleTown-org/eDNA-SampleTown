import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getConstrainedValues } from '$lib/server/constrained-values';
import { getActivePersonnel } from '$lib/server/personnel';

export const load: PageServerLoad = async ({ url }) => {
	const db = getDb();
	const projects = db.prepare('SELECT id, project_name FROM projects ORDER BY project_name').all();
	const sites = db.prepare(`
		SELECT s.id, s.site_name, s.project_id, s.lat_lon, s.latitude, s.longitude, s.geo_loc_name,
			s.env_broad_scale, s.env_local_scale
		FROM sites s WHERE s.is_deleted = 0 ORDER BY s.site_name
	`).all();
	const picklists = getConstrainedValues('geo_loc_name', 'env_broad_scale', 'env_local_scale', 'env_medium', 'filter_type', 'samp_store_sol', 'samp_collect_device', 'person_role');
	const personnel = getActivePersonnel();
	return {
		projects, sites, picklists, personnel,
		preselectedProjectId: url.searchParams.get('project_id') || '',
		preselectedSiteId: url.searchParams.get('site_id') || ''
	};
};
