import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { findEntityById, pathFor, newPathFor, type EntityType } from '$lib/server/id-lookup';
import { requireLab } from '$lib/server/guards';

const VALID_TYPES: EntityType[] = [
	'project', 'site', 'sample', 'extract',
	'pcr_plate', 'pcr_reaction', 'library_plate', 'library', 'run'
];

/**
 * /id/<uuid> — the QR-code URL. If the id is already assigned to an
 * entity in the signed-in user's lab, redirect straight to its detail
 * page. Otherwise:
 *   - if the URL carries `?t=<type>` (pre-typed sticker from the label
 *     generator), skip the picker and redirect to that type's new-form.
 *   - else render the claim page so the user picks an entity type.
 *
 * IDs that resolve to a row in a different lab are treated as unclaimed
 * — a scan by lab B shouldn't leak existence of lab A's entities. The
 * user will see the claim page and, if they try to claim it, the POST
 * will collide at the unique-id layer.
 */
export const load: PageServerLoad = async ({ params, url, locals }) => {
	const { labId } = requireLab(locals);
	const db = getDb();
	const found = findEntityById(db, params.uuid, labId);
	if (found) throw redirect(302, pathFor(found.type, found.id));
	const hint = url.searchParams.get('t');
	if (hint && (VALID_TYPES as string[]).includes(hint)) {
		throw redirect(302, newPathFor(hint as EntityType, params.uuid));
	}
	return { uuid: params.uuid };
};
