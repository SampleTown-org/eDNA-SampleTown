import type { PageServerLoad } from './$types';
import {
	MIXS_ACTIVE_VERSION,
	allSlotNames,
	allSlotsFor,
	getSlot,
	listChecklists,
	listExtensions
} from '$lib/mixs/schema-index';

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

	const checklistRaw = listChecklists();
	const extensionRaw = listExtensions();

	// Precompute (checklist × extension) → slot-list for the combo filter.
	// Keys are `${checklist}|${extension}` to avoid any `+` ambiguity.
	const combos: Record<string, string[]> = {};
	for (const c of checklistRaw) {
		for (const e of extensionRaw) {
			const props = allSlotsFor(c.name, e.name);
			if (props.length > 0) combos[`${c.name}|${e.name}`] = props;
		}
	}

	// Checklists are LinkML mixins — their .properties is empty (only the
	// materialized combination class enumerates slots). Synthesize the
	// checklist-only filter by unioning every combo that uses that checklist.
	// Same belt-and-braces logic for extensions so the count is what shows
	// up across all combos in either direction.
	const unionAcross = (axis: 'checklist' | 'extension', name: string) => {
		const set = new Set<string>();
		for (const [key, props] of Object.entries(combos)) {
			const [c, e] = key.split('|');
			if ((axis === 'checklist' ? c : e) === name) for (const p of props) set.add(p);
		}
		return [...set];
	};

	const checklists = checklistRaw.map((c) => ({
		name: c.name,
		title: c.title,
		description: c.description ?? '',
		properties: unionAcross('checklist', c.name)
	}));
	const extensions = extensionRaw.map((e) => ({
		name: e.name,
		title: e.title,
		description: e.description ?? '',
		properties: unionAcross('extension', e.name)
	}));

	return {
		version: MIXS_ACTIVE_VERSION,
		slots,
		checklists,
		extensions,
		combos
	};
};
