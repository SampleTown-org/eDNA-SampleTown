import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireUser } from '$lib/server/guards';
import { apiError } from '$lib/server/api-errors';
import { checkRate } from '$lib/server/rate-limit';
import { createApiToken, listApiTokens } from '$lib/server/auth';

/**
 * Personal API tokens for the signed-in user.
 *
 *   GET  → the caller's live tokens (never the token itself, only its prefix)
 *   POST → { name, ttl_days? } creates one; the plaintext comes back once
 *
 * Session-only: the auth hook refuses token auth under /api/account, so a
 * token cannot be used to mint another.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const user = requireUser(locals);
	return json(listApiTokens(user.id));
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = requireUser(locals);
	try {
		if (!checkRate(`api-token-create:${user.id}`, 10, 60 * 60_000)) {
			return json({ error: 'Too many tokens created — try again later' }, { status: 429 });
		}
		const body = (await request.json().catch(() => null)) as { name?: unknown; ttl_days?: unknown } | null;
		const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : '';
		if (!name) return json({ error: 'A token name is required' }, { status: 400 });
		const ttl = body?.ttl_days == null || body.ttl_days === '' ? null : Number(body.ttl_days);
		if (ttl != null && (!Number.isFinite(ttl) || ttl <= 0)) {
			return json({ error: 'ttl_days must be a positive number' }, { status: 400 });
		}
		if (listApiTokens(user.id).length >= 20) {
			return json({ error: 'Token limit reached (20). Revoke one first.' }, { status: 400 });
		}
		const { token, row } = createApiToken(user.id, name, ttl);
		return json({ ...row, token }, { status: 201 });
	} catch (err) {
		return apiError(err);
	}
};
