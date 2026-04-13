import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getConstrainedValues } from '$lib/server/constrained-values';
import { getActivePersonnel } from '$lib/server/personnel';
import { getEntityPersonnel } from '$lib/server/entity-personnel';

export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();

	const sample = db.prepare(`
		SELECT s.*, p.project_name
		FROM samples s
		JOIN projects p ON p.id = s.project_id
		WHERE s.id = ? AND s.is_deleted = 0
	`).get(params.sampleId);
	if (!sample) throw error(404, 'Sample not found');

	const projects = db.prepare('SELECT id, project_name FROM projects ORDER BY project_name').all();
	const sites = db.prepare(`
		SELECT s.id, s.site_name, s.project_id, s.lat_lon, s.latitude, s.longitude, s.geo_loc_name,
			s.env_broad_scale, s.env_local_scale
		FROM sites s WHERE s.is_deleted = 0 ORDER BY s.site_name
	`).all();
	const picklists = getConstrainedValues(
		'geo_loc_name', 'env_broad_scale', 'env_local_scale', 'env_medium',
		'filter_type',
		'samp_store_sol', 'samp_store_temp', 'samp_store_loc', 'samp_store_dur', 'store_cond',
		'samp_collect_device', 'samp_collect_method',
		'person_role'
	);
	const personnel = getActivePersonnel();
	const people = getEntityPersonnel('sample', params.sampleId).map((p) => ({
		personnel_id: p.personnel_id,
		role: p.role
	}));

	return { sample, projects, sites, picklists, personnel, people };
};
