import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import { getConstrainedValues } from '$lib/server/constrained-values';
import { getActivePersonnel } from '$lib/server/personnel';
import { getEntityPersonnel } from '$lib/server/entity-personnel';

/**
 * The same `[pcrId]` slug is used for both PCR plates and individual
 * amplification reactions (matching the dual-mode detail page in
 * src/routes/pcr/[pcrId]/+page.server.ts). Try as a plate first; fall
 * back to a reaction if no plate matches. Each branch loads the data
 * the matching .svelte form needs.
 */
export const load: PageServerLoad = async ({ params }) => {
	const db = getDb();

	const plate = db
		.prepare('SELECT * FROM pcr_plates WHERE id = ? AND is_deleted = 0')
		.get(params.pcrId);
	if (plate) {
		const personnel = getActivePersonnel();
		const picklists = getConstrainedValues('person_role', 'polymerase');
		const people = getEntityPersonnel('pcr_plate', params.pcrId).map((p) => ({
			personnel_id: p.personnel_id,
			role: p.role
		}));
		return { type: 'plate' as const, plate, personnel, picklists, people };
	}

	const pcr = db
		.prepare('SELECT * FROM pcr_amplifications WHERE id = ? AND is_deleted = 0')
		.get(params.pcrId);
	if (!pcr) throw error(404, 'PCR plate or reaction not found');
	return { type: 'reaction' as const, pcr };
};
