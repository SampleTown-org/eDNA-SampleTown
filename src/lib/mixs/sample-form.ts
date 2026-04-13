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
import { getSlot, getEnum, recommendedSlotsFor, requiredSlotsFor, getCombinationClass, getClass } from './schema-index';
import { slotTable } from './slot-ownership';

export type FormInputType = 'text' | 'number' | 'date' | 'select' | 'textarea';

export interface SlotOption { value: string; label: string }

export interface SlotConfig {
	slot: string;
	type: FormInputType;
	/** Inline options for select inputs — resolved from either a MIxS enum
	 *  or a local SampleTown picklist at organizeForm time. */
	options?: SlotOption[];
	/** Placeholder — falls back to slot.examples[0]. */
	placeholder?: string;
	/** MIxS-recommended for the active (checklist, extension). Surfaces as
	 *  an amber `*` when rendered outside the Required section. */
	recommended?: boolean;
}

/**
 * SampleTown-specific type overrides. Only non-default input types go here —
 * picklist bindings are auto-detected (see resolveSlotConfig below). Left
 * intentionally small: anything that MIxS can tell us (range, enum, examples)
 * doesn't need an entry.
 */
const OVERRIDES: Record<string, { type: FormInputType }> = {
	// samp_mat_process is free-text in MIxS but is almost always a multi-step
	// description in practice — render as a textarea so long values don't wrap
	// off the edge of a single-line input.
	samp_mat_process: { type: 'textarea' }
};

/** Slots displayed explicitly in the form's Identity header; excluded from bucketing. */
export const HEADER_SLOTS = new Set(['samp_name', 'collection_date', 'env_medium']);

export interface OrganizedForm {
	required: SlotConfig[];
	/** Non-required slots grouped by bucket. Recommended ones carry
	 *  `recommended: true` and render with an amber `*` marker. */
	optional: Record<string, SlotConfig[]>;
	/** Required slots that live on a different SampleTown table — surfaced for UI hints. */
	requiredOffSample: Array<{ slot: string; table: string }>;
}

/** Picklist categories keyed by category name → [{value, label}]. */
export type Picklists = Record<string, SlotOption[]>;

/**
 * Bucket every property of the active combination class for display on the
 * sample form. Filters out slots owned by other tables — those surface
 * separately as "required on another tab".
 *
 * `picklists` is the set of SampleTown-managed categories available via
 * `data.picklists`. Any slot whose name matches a category key gets a
 * dropdown bound to that category; separately, any slot whose MIxS range
 * is an enum class gets a dropdown populated from the enum's
 * permissible_values. MIxS enum wins over local picklist when both exist.
 */
export function organizeForm(
	checklist: string,
	extension: string | null,
	picklists: Picklists = {}
): OrganizedForm {
	const cls = extension ? getCombinationClass(checklist, extension) : getClass(checklist);
	const required = new Set(requiredSlotsFor(checklist, extension ?? ''));
	const recommended = recommendedSlotsFor(checklist, extension ?? '');
	const properties = cls?.properties ?? [];

	const out: OrganizedForm = {
		required: [],
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

		const config = resolveSlotConfig(slot, picklists);
		if (required.has(slot)) {
			out.required.push(config);
		} else {
			if (recommended.has(slot)) config.recommended = true;
			const bucket = subsetOfSlot(slot);
			(out.optional[bucket] ??= []).push(config);
		}
	}

	return out;
}

/**
 * Resolve a slot's UI config. Priority for choosing a select's options:
 *   1. Local SampleTown picklist with a matching category name
 *   2. MIxS enum range (permissible_values from the schema)
 *   3. No options — render as text/number/textarea per MIxS range + overrides
 * Local picklist wins over MIxS enum because operators curate kits/vocabularies
 * that are narrower than the MIxS-defined set in practice.
 */
function resolveSlotConfig(slot: string, picklists: Picklists): SlotConfig {
	const meta = getSlot(slot);
	const override = OVERRIDES[slot];
	const placeholder = meta?.examples?.[0];

	// Explicit type override always wins.
	if (override?.type) {
		return { slot, type: override.type, placeholder };
	}

	// 1. Local picklist auto-bind — category name matches slot name.
	if (picklists[slot] && picklists[slot].length > 0) {
		return { slot, type: 'select', options: picklists[slot], placeholder };
	}

	// 2. MIxS enum range → dropdown from permissible_values.
	if (meta?.range) {
		const enumDef = getEnum(meta.range);
		if (enumDef && enumDef.values.length > 0) {
			return {
				slot,
				type: 'select',
				options: enumDef.values.map((v) => ({ value: v.value, label: v.value })),
				placeholder
			};
		}
		// 3. Numeric range → number input
		if (/^(float|double|integer|decimal)$/i.test(meta.range)) {
			return { slot, type: 'number', placeholder };
		}
	}

	return { slot, type: 'text', placeholder };
}

/**
 * Force specific slots into SampleTown-native buckets that cut across MIxS
 * subsets. Storage groups the samp_store_* slots plus store_cond into a
 * single display section; Sampling absorbs what MIxS calls "nucleic acid
 * sequence source" for slots that are really about the physical collection
 * (samp_collect_*, size_frac, samp_mat_process, source_mat_id) — the NASS
 * label was confusing operators, and every remaining slot in that subset
 * lives on extracts/pcr now anyway.
 */
const BUCKET_OVERRIDES: Record<string, string> = {
	// Storage — all samp_store_* plus MIxS store_cond
	samp_store_sol: 'Storage',
	samp_store_temp: 'Storage',
	samp_store_dur: 'Storage',
	samp_store_loc: 'Storage',
	store_cond: 'Storage',

	// Sampling — absorbs MIxS NASS-subset slots that are really about the
	// physical collection
	samp_collect_device: 'Sampling',
	samp_collect_method: 'Sampling',
	samp_mat_process: 'Sampling',
	samp_size: 'Sampling',
	size_frac: 'Sampling',
	source_mat_id: 'Sampling',
	filter_type: 'Sampling',

	// Environment — organism-environment relationships (MIxS classifies as NASS)
	rel_to_oxygen: 'Environment',
	oxy_stat_samp: 'Environment',
	biotic_relationship: 'Environment',
	trophic_level: 'Environment',
	pathogenicity: 'Environment',
	tidal_stage: 'Environment',

	// Investigation — culture / isolate / reference metadata
	isol_growth_condt: 'Investigation',
	ref_biomaterial: 'Investigation',
	encoded_traits: 'Investigation',
	estimated_size: 'Investigation',
	propagation: 'Investigation',
	ploidy: 'Investigation',
	subspecf_gen_lin: 'Investigation',
	host_disease_stat: 'Investigation',
	host_spec_range: 'Investigation',
	tax_ident: 'Investigation'
};

/**
 * Group Optional slots by bucket. Priority:
 *   1. BUCKET_OVERRIDES (SampleTown-specific grouping)
 *   2. MIxS `in_subset` — capitalized
 * Exception: MIxS "nucleic acid sequence source" never surfaces as a bucket
 * — everything in NASS is either moved to another table, routed via
 * BUCKET_OVERRIDES, or falls through to `Other`.
 */
function subsetOfSlot(slot: string): string {
	if (BUCKET_OVERRIDES[slot]) return BUCKET_OVERRIDES[slot];
	const sub = getSlot(slot)?.in_subset?.[0];
	if (!sub || sub === 'nucleic acid sequence source') return 'Other';
	return sub.replace(/^[a-z]/, (c) => c.toUpperCase());
}

/** Order the optional-bucket keys sensibly for display. */
export function orderedOptionalBuckets(optional: Record<string, SlotConfig[]>): [string, SlotConfig[]][] {
	const priority: Record<string, number> = {
		Environment: 0,
		Sampling: 1,
		Storage: 2,
		Investigation: 3,
		Sequencing: 4,
		Other: 99
	};
	return Object.entries(optional).sort(([a], [b]) => (priority[a] ?? 50) - (priority[b] ?? 50));
}
