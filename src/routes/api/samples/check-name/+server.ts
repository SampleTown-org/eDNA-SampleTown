import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { requireLab } from '$lib/server/guards';

/**
 * Authoritative duplicate-name check for the capture wizard. Matches the
 * UNIQUE(project_id, samp_name) constraint EXACTLY — case-sensitive and
 * including soft-deleted rows (a soft-deleted sample still reserves the name,
 * so re-using it would 409 on insert). Lab-scoped.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const { labId } = requireLab(locals);
	const projectId = url.searchParams.get('project_id') ?? '';
	const sampName = (url.searchParams.get('samp_name') ?? '').trim();
	if (!projectId || !sampName) return json({ taken: false });
	const db = getDb();
	const row = db
		.prepare('SELECT 1 FROM samples WHERE lab_id = ? AND project_id = ? AND samp_name = ? LIMIT 1')
		.get(labId, projectId, sampName);
	return json({ taken: !!row });
};
