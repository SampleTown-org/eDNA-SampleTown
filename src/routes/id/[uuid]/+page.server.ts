import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { findEntityById, pathFor, newPathFor, type EntityType } from '$lib/server/id-lookup';

const VALID_TYPES: EntityType[] = [
	'project', 'site', 'sample', 'extract',
	'pcr_plate', 'pcr_reaction', 'library_plate', 'library', 'run'
];

/**
 * /id/<uuid> — the QR-code URL. If the id is already assigned to an
 * entity, redirect straight to its detail page. Otherwise:
 *   - if the URL carries `?t=<type>` (pre-typed sticker from the label
 *     generator), skip the picker and redirect to that type's new-form.
 *   - else render the claim page so the user picks an entity type.
 */
export const load: PageServerLoad = async ({ params, url }) => {
	const db = getDb();
	const found = findEntityById(db, params.uuid);
	if (found) throw redirect(302, pathFor(found.type, found.id));
	const hint = url.searchParams.get('t');
	if (hint && (VALID_TYPES as string[]).includes(hint)) {
		throw redirect(302, newPathFor(hint as EntityType, params.uuid));
	}
	return { uuid: params.uuid };
};
