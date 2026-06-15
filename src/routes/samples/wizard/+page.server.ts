import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';
import { getConstrainedValues } from '$lib/server/constrained-values';
import { getActivePersonnel } from '$lib/server/personnel';

/**
 * Loader for the offline field-capture wizard (docs/dev/offline-pwa.md).
 * Mirrors the batch loader but also pulls the site-creation picklists the
 * inline site sub-wizard (#5) needs. Everything here is precacheable by the
 * service worker (#2) so the wizard renders offline.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const projects = db
		.prepare('SELECT id, project_name FROM projects WHERE lab_id = ? ORDER BY project_name')
		.all(labId);
	const sites = db
		.prepare('SELECT id, site_name, project_id FROM sites WHERE is_deleted = 0 AND lab_id = ? ORDER BY site_name')
		.all(labId);
	const personnel = getActivePersonnel(labId);
	const templates = db
		.prepare(
			`SELECT id, name, description, mixs_checklist, extension, params
			 FROM sample_templates WHERE lab_id = ? AND is_deleted = 0 ORDER BY name`
		)
		.all(labId);
	// Existing (project_id, samp_name) pairs so the wizard can flag a duplicate
	// name as you type instead of only failing at save. Names are small; ships
	// in the SSR payload so the check still works offline (SW-cached).
	const sampleNames = db
		.prepare('SELECT project_id, samp_name FROM samples WHERE lab_id = ? AND is_deleted = 0')
		.all(labId);
	const picklists = getConstrainedValues(
		labId,
		'geo_loc_name', 'env_broad_scale', 'env_local_scale', 'env_medium',
		'filter_type',
		'samp_store_sol', 'samp_store_temp', 'samp_store_loc', 'samp_store_dur', 'store_cond',
		'samp_collect_device', 'samp_collect_method',
		'person_role'
	);
	return {
		projects,
		sites,
		personnel,
		templates,
		sampleNames,
		picklists,
		preselectedProjectId: url.searchParams.get('project_id') || '',
		preselectedSiteId: url.searchParams.get('site_id') || '',
		scannedId: url.searchParams.get('id') || ''
	};
};
