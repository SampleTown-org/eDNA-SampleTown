import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Setup-lab is reachable for any signed-in user with lab_id=NULL — and
 * NOTHING else. Unauth visitors get bounced to /auth/login (with a `next=`
 * back here so they land on this page after signing in). Signed-in users
 * who already have a lab get sent to / since this page would just confuse
 * them otherwise.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		throw redirect(302, '/auth/login?next=' + encodeURIComponent('/auth/setup-lab'));
	}
	if (locals.user.lab_id) {
		throw redirect(302, '/');
	}
	return {};
};
