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
	// materialized combination class enumerates slots). Synthesize each
	// axis's "own" slot set as the INTERSECTION across every combo using
	// it: a slot present in every (checklist, *) combo is checklist-owned;
	// a slot in every (*, extension) combo is extension-owned. Union would
	// double-count extension-specific slots into the checklist count and
	// produce a 700+ list that doesn't match the GSC docs.
	const intersectAcross = (axis: 'checklist' | 'extension', name: string) => {
		let acc: Set<string> | null = null;
		for (const [key, props] of Object.entries(combos)) {
			const [c, e] = key.split('|');
			if ((axis === 'checklist' ? c : e) !== name) continue;
			const here = new Set(props);
			if (acc === null) acc = here;
			else for (const s of [...acc]) if (!here.has(s)) acc.delete(s);
		}
		return acc ? [...acc] : [];
	};

	const checklists = checklistRaw.map((c) => ({
		name: c.name,
		title: c.title,
		description: c.description ?? '',
		properties: intersectAcross('checklist', c.name)
	}));
	const extensions = extensionRaw.map((e) => ({
		name: e.name,
		title: e.title,
		description: e.description ?? '',
		properties: intersectAcross('extension', e.name)
	}));

	return {
		version: MIXS_ACTIVE_VERSION,
		slots,
		checklists,
		extensions,
		combos
	};
};
