import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { requireUser } from '$lib/server/guards';
import { checkRate } from '$lib/server/rate-limit';
import { listRepoLabSlugs } from '$lib/server/github';

/**
 * Step 1 of "sync an existing lab": validate a snapshot repo + token and
 * list which lab slugs it contains, so the user can pick one before
 * anything is created locally. Reachable by lab-less users (it's on the
 * hooks LAB_SETUP_ALLOWLIST).
 */
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
	const user = requireUser(locals);
	if (user.is_demo) {
		return json({ error: 'Demo accounts cannot sync labs' }, { status: 403 });
	}
	if (!checkRate(`sync-probe:${getClientAddress()}`, 10, 60_000)) {
		return json({ error: 'Too many attempts, please wait a minute.' }, { status: 429 });
	}

	let body: { repo?: unknown; token?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	const repo = typeof body.repo === 'string' ? body.repo.trim() : '';
	const token = typeof body.token === 'string' ? body.token.trim() : '';
	if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repo)) {
		return json({ error: 'Repo must be in "owner/repo" format' }, { status: 400 });
	}
	if (!token) return json({ error: 'Token is required' }, { status: 400 });

	const result = await listRepoLabSlugs({ repo, token });
	if (!result.ok) return json({ error: result.error }, { status: 400 });

	// Flag slugs that already exist on this instance — those can't be
	// created again; the user should ask that lab's local admin for access.
	const db = getDb();
	const labs = result.slugs.map((slug) => ({
		slug,
		taken: !!db.prepare('SELECT 1 FROM labs WHERE slug = ?').get(slug)
	}));
	return json({ labs });
};
