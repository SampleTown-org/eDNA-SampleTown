import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * The capture flow was renamed wizard → "quick" (/samples/quick). Forward any
 * old bookmarks, stale PWA-cached links, or QR/deep links here, preserving the
 * query string (preselected project_id / site_id / scanned id).
 */
export const load: PageServerLoad = async ({ url }) => {
	throw redirect(308, `/samples/quick${url.search}`);
};
