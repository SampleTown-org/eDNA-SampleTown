import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { requireUser } from '$lib/server/guards';
import { apiError } from '$lib/server/api-errors';
import { checkRate } from '$lib/server/rate-limit';
import { createLab } from '$lib/server/lab-setup';
import { listRepoLabSlugs, bootstrapLabFromRepo } from '$lib/server/github';

const MAX_LAB_NAME = 80;

/**
 * Step 2 of "sync an existing lab": create a local replica of a lab that
 * lives in a snapshot repo (typically pushed by another SampleTown
 * instance — the online one). The new lab is created with the EXACT slug
 * the repo uses (sync addresses labs by `data/<slug>`), pre-wired with
 * the repo + token and sync enabled, the caller becomes its local admin,
 * and the repo's current snapshot is pulled in immediately.
 *
 * If the initial pull fails the lab is left in place: it's empty and
 * sync-enabled, so the 15-minute scheduler's first-run logic retries the
 * pull automatically, and the admin can fix the repo/token in
 * Settings → Backup. Nothing here can clobber remote data — the first
 * push only happens after a successful sync baseline exists.
 *
 * Shares the lab-creation rate limit (3/IP/day).
 */
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
	const user = requireUser(locals);
	if (user.is_demo) {
		return json({ error: 'Demo accounts cannot sync labs' }, { status: 403 });
	}
	const ip = getClientAddress();
	if (!checkRate(`lab-create:${ip}`, 3, 24 * 60 * 60_000)) {
		return json({ error: 'Too many lab creations from this address; try again tomorrow' }, { status: 429 });
	}

	let body: { repo?: unknown; token?: unknown; slug?: unknown; name?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	const repo = typeof body.repo === 'string' ? body.repo.trim() : '';
	const token = typeof body.token === 'string' ? body.token.trim() : '';
	const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
	const name = typeof body.name === 'string' ? body.name.trim() : '';
	if (!/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(repo)) {
		return json({ error: 'Repo must be in "owner/repo" format' }, { status: 400 });
	}
	if (!token) return json({ error: 'Token is required' }, { status: 400 });
	if (!slug) return json({ error: 'Pick which lab in the repo to sync' }, { status: 400 });
	if (!name) return json({ error: 'Lab name is required' }, { status: 400 });
	if (name.length > MAX_LAB_NAME) {
		return json({ error: `Lab name must be ${MAX_LAB_NAME} characters or fewer` }, { status: 400 });
	}

	// Re-verify against the repo before creating anything: the token must
	// work and the slug must actually be in there.
	const probe = await listRepoLabSlugs({ repo, token });
	if (!probe.ok) return json({ error: probe.error }, { status: 400 });
	if (!probe.slugs.includes(slug)) {
		return json({ error: `The repo has no snapshot for "${slug}"` }, { status: 400 });
	}

	try {
		const db = getDb();
		let labId = '';
		db.transaction(() => {
			labId = createLab(db, name, slug);
			const created = db.prepare('SELECT slug FROM labs WHERE id = ?').get(labId) as { slug: string };
			// createLab normalizes slugs; sync addresses the repo by exact
			// slug, so any drift would silently point at a different path.
			if (created.slug !== slug) throw new Error(`Slug "${slug}" is not usable as-is`);
			db.prepare(
				`UPDATE labs SET github_repo = ?, github_token = ?, sync_enabled = 1,
				 updated_at = datetime('now') WHERE id = ?`
			).run(repo, token, labId);
			db.prepare(
				`INSERT INTO lab_memberships (user_id, lab_id, role, status)
				 VALUES (?, ?, 'admin', 'active')`
			).run(user.id, labId);
			db.prepare(
				"UPDATE users SET lab_id = ?, active_lab_id = ?, role = 'admin', updated_at = datetime('now') WHERE id = ?"
			).run(labId, labId, user.id);
		})();

		const pull = await bootstrapLabFromRepo(labId);
		const lab = db.prepare('SELECT id, name, slug FROM labs WHERE id = ?').get(labId);
		if (!pull.ok) {
			return json(
				{
					lab,
					warning: `Lab created, but the initial pull failed: ${pull.error} — sync will retry within 15 minutes; check Settings → Backup.`
				},
				{ status: 201 }
			);
		}
		const total = Object.values(pull.counts).reduce((a, b) => a + b, 0);
		return json({ lab, pulled: total }, { status: 201 });
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (msg.includes('already taken')) {
			return json(
				{ error: `A lab with slug "${slug}" already exists on this instance — ask its admin for an invite here.` },
				{ status: 409 }
			);
		}
		return apiError(err);
	}
};
