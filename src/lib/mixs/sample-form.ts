/**
 * Sample form structure, driven by the active MIxS combination class.
 *
 * The form renders every slot the (checklist, extension) combination class
 * lists in its `properties`, filtered to slots that actually belong on the
 * samples table (see slot-ownership.ts). Slots go into buckets by MIxS
 * cardinality (Required → Recommended → Optional by subset). When MIxS
 * bumps a release, the form picks up new slots automatically.
 *
 * SampleTown-specific additions are kept minimal: a tiny OVERRIDES map for
 * slots where we bind a local picklist (env_medium, filter_type, etc.).
 * Input type, placeholder, unit hints, and structured patterns all come
 * from the MIxS schema index.
 */
import { getSlot, recommendedSlotsFor, requiredSlotsFor, getCombinationClass, getClass } from './schema-index';
import { slotTable } from './slot-ownership';

export type FormInputType = 'text' | 'number' | 'date' | 'select' | 'textarea';

export interface SlotConfig {
	slot: string;
	type: FormInputType;
	/** Name of a constrained_values picklist (select only). */
	picklist?: string;
	/** Placeholder — falls back to slot.examples[0]. */
	placeholder?: string;
}

/**
 * Minimal SampleTown-specific overrides. Only slots that need a local picklist
 * or a type we can't infer from MIxS land here. Everything else derives from
 * the MIxS schema index.
 */
const OVERRIDES: Record<string, Partial<SlotConfig>> = {
	env_medium: { type: 'select', picklist: 'env_medium' },
	filter_type: { type: 'select', picklist: 'filter_type' },
	samp_store_sol: { type: 'select', picklist: 'samp_store_sol' },
	samp_collect_device: { type: 'select', picklist: 'samp_collect_device' },
	samp_mat_process: { type: 'textarea' }
};

/** Slots displayed explicitly in the form's Identity header; excluded from bucketing. */
export const HEADER_SLOTS = new Set(['samp_name', 'collection_date', 'env_medium']);

export interface OrganizedForm {
	required: SlotConfig[];
	recommended: SlotConfig[];
	/** Optional slots grouped by MIxS `in_subset`. Buckets with zero entries stay empty. */
	optional: Record<string, SlotConfig[]>;
	/** Required slots that live on a different SampleTown table — surfaced for UI hints. */
	requiredOffSample: Array<{ slot: string; table: string }>;
}

/**
 * Bucket every property of the active combination class for display on the
 * sample form. Filters out slots owned by other tables (sites, extracts,
 * pcr_plates, etc.) — those get surfaced separately as "on another tab".
 */
export function organizeForm(checklist: string, extension: string | null): OrganizedForm {
	const cls = extension ? getCombinationClass(checklist, extension) : getClass(checklist);
	const required = new Set(requiredSlotsFor(checklist, extension ?? ''));
	const recommended = recommendedSlotsFor(checklist, extension ?? '');
	const properties = cls?.properties ?? [];

	const out: OrganizedForm = {
		required: [],
		recommended: [],
		optional: {},
		requiredOffSample: []
	};

	for (const slot of properties) {
		if (HEADER_SLOTS.has(slot)) continue;
		const table = slotTable(slot);

		if (table !== 'samples') {
			if (required.has(slot)) out.requiredOffSample.push({ slot, table });
			continue;
		}

		const config = resolveSlotConfig(slot);
		if (required.has(slot)) out.required.push(config);
		else if (recommended.has(slot)) out.recommended.push(config);
		else {
			const bucket = subsetOfSlot(slot);
			(out.optional[bucket] ??= []).push(config);
		}
	}

	return out;
}

/** Build a SlotConfig from MIxS metadata + SampleTown overrides. */
function resolveSlotConfig(slot: string): SlotConfig {
	const meta = getSlot(slot);
	const override = OVERRIDES[slot] ?? {};

	// Type inference: OVERRIDES wins, else infer from MIxS range.
	let type: FormInputType = override.type ?? 'text';
	if (!override.type) {
		const range = meta?.range;
		if (range && /^(float|double|integer|decimal)$/i.test(range)) type = 'number';
		// collection_date is the only date-ish slot on samples; it's in HEADER_SLOTS so we skip 'date'
	}

	return {
		slot,
		type,
		picklist: override.picklist,
		placeholder: meta?.examples?.[0]
	};
}

/** Group Optional slots by MIxS `in_subset` (fallback `other`). */
function subsetOfSlot(slot: string): string {
	const sub = getSlot(slot)?.in_subset?.[0];
	if (!sub) return 'other';
	// Normalize LinkML subset names to display-friendly labels.
	return sub.replace(/^[a-z]/, (c) => c.toUpperCase());
}

/** Order the optional-bucket keys sensibly for display. */
export function orderedOptionalBuckets(optional: Record<string, SlotConfig[]>): [string, SlotConfig[]][] {
	const priority: Record<string, number> = {
		'Environment': 0,
		'Nucleic acid sequence source': 1,
		'Investigation': 2,
		'Sequencing': 3,
		'other': 99
	};
	return Object.entries(optional).sort(([a], [b]) => (priority[a] ?? 50) - (priority[b] ?? 50));
}
