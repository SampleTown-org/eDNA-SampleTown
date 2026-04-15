import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';
import { getConstrainedValues } from '$lib/server/constrained-values';
import { getActivePersonnel } from '$lib/server/personnel';

/**
 * Batch is now the single sample-entry form. Load the full picklist set the
 * single-sample form used so every bucket's select can auto-bind.
 * Preselected project/site come from the legacy /samples/new redirect.
 */
export const load: PageServerLoad = async ({ url, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const projects = db
		.prepare('SELECT id, project_name FROM projects WHERE lab_id = ? ORDER BY project_name')
		.all(labId);
	const sites = db.prepare(`
		SELECT id, site_name, project_id FROM sites WHERE is_deleted = 0 AND lab_id = ? ORDER BY site_name
	`).all(labId);
	const personnel = getActivePersonnel(labId);
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
		picklists,
		preselectedProjectId: url.searchParams.get('project_id') || '',
		preselectedSiteId: url.searchParams.get('site_id') || '',
		/** Scanned QR id (pre-allocated UUID). When present, the first row's
		 *  POST will use it as the sample id. */
		scannedId: url.searchParams.get('id') || ''
	};
};
