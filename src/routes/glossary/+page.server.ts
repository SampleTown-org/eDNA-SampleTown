import type { PageServerLoad } from './$types';
import { MIXS_ACTIVE_VERSION, allSlotNames, getSlot, listChecklists, listExtensions } from '$lib/mixs/schema-index';

/**
 * Glossary page loader — all data is derived from the baked-in MIxS schema
 * index so this works offline on the ship. Nothing hits the DB.
 */
export const load: PageServerLoad = async () => {
	const slots = allSlotNames()
		.map((name) => {
			const s = getSlot(name);
			return {
				name,
				title: s?.title ?? name,
				description: s?.description ?? '',
				examples: s?.examples ?? [],
				pattern: s?.structured_pattern ?? s?.pattern,
				slot_uri: s?.slot_uri,
				in_subset: s?.in_subset ?? [],
				range: s?.range,
				keywords: s?.keywords ?? []
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));

	return {
		version: MIXS_ACTIVE_VERSION,
		slots,
		checklists: listChecklists().map((c) => ({
			name: c.name,
			title: c.title,
			description: c.description ?? ''
		})),
		extensions: listExtensions().map((c) => ({
			name: c.name,
			title: c.title,
			description: c.description ?? ''
		}))
	};
};
