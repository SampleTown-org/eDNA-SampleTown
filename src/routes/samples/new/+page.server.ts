import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * /samples/new was retired — the batch entry form now covers single-sample
 * workflows too, starting with one sample on deck. Forward any bookmarks,
 * nav links, or project/site "New Sample" buttons (which pass
 * ?project_id= / ?site_id=) to /samples/batch without losing the query.
 */
export const load: PageServerLoad = async ({ url }) => {
	throw redirect(302, `/samples/batch${url.search}`);
};
