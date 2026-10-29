import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { revokeApiToken } from '$lib/server/auth';

/** Revoke one of the caller's own API tokens. 404 for anyone else's. */
export const DELETE: RequestHandler = async ({ params, locals }) => {
	const user = requireUser(locals);
	if (!revokeApiToken(user.id, params.id)) {
		return json({ error: 'Token not found' }, { status: 404 });
	}
	return json({ ok: true });
};
