import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { commitSnapshot } from '$lib/server/github';

export const POST: RequestHandler = async ({ request }) => {
	const { message } = await request.json().catch(() => ({ message: '' }));
	const commitMessage = message || `DB snapshot ${new Date().toISOString()}`;

	const result = await commitSnapshot(commitMessage);
	if (!result) {
		throw error(500, 'Snapshot failed — check GITHUB_TOKEN and GITHUB_REPO');
	}

	return json({ ok: true, sha: result.sha });
};
