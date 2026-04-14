import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { findEntityById, pathFor } from '$lib/server/id-lookup';

/**
 * /id/<uuid> — the QR-code URL. If the id is already assigned to an
 * entity, redirect straight to its detail page. If not, fall through to
 * the claim page where the user picks an entity type to create.
 *
 * Generic camera apps that open this URL see the redirect; SampleTown's
 * own scanner uses the `/api/id/<uuid>` JSON endpoint to avoid a full
 * page load.
 */
export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();
	const found = findEntityById(db, params.uuid);
	if (found) throw redirect(302, pathFor(found.type, found.id));
	return { uuid: params.uuid };
};
