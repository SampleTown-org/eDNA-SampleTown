import type { PageServerLoad } from './$types';
import { requireUser } from '$lib/server/guards';
import { listApiTokens } from '$lib/server/auth';

export const load: PageServerLoad = async ({ locals }) => {
	// Any signed-in user can reach this page (admin/user/viewer alike).
	const user = requireUser(locals);
	return { user, tokens: listApiTokens(user.id) };
};
