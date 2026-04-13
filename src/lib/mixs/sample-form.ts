/**
 * Single source of truth for which MIxS slots the sample form surfaces,
 * and how each one should render. Consumed by samples/new + samples/[id]/edit
 * so they stay in lockstep.
 *
 * What's NOT here (by design):
 *   - project_name — sample inherits its project; emit from projects.project_name at export time
 *   - nucl_acid_ext — extraction protocol, lives on extracts
 *   - nucl_acid_amp — amplification protocol, lives on pcr_plates
 *   - tax_ident — determined by the PCR primer set via primer_sets.target_gene
 *   - seq_meth / lib_layout — sequencing run-level concerns
 *
 * Priority bucketing (Required / Recommended / Optional) is resolved at
 * render time from the active (checklist, extension) via requiredSlotSet +
 * recommendedSlotSet in $lib/mixs/checklists.
 */
import { getSlot } from './schema-index';
import { requiredSlotSet, recommendedSlotSet } from './checklists';

export interface SampleFormSlot {
	/** MIxS slot name (or SampleTown-local column like `collector_name`, `notes`). */
	slot: string;
	/** Input type routing in <SlotInput>. */
	type: 'text' | 'number' | 'date' | 'select' | 'textarea';
	/** Name of a constrained_values picklist for select/text-with-options fields. */
	constrainedCategory?: string;
	/** Display unit appended to the label (MIxS stores units inside values). */
	unit?: string;
	/** Placeholder override; falls back to slot.examples[0]. */
	placeholder?: string;
	/** Grid colspan hint: 1 (half-width) or 2 (full). Default 1. */
	colSpan?: 1 | 2;
	/** Which MIxS subset the slot belongs to for grouping in the Optional bucket.
	 *  If absent we fall back to the slot's `in_subset` from the schema index. */
	subset?: 'environment' | 'sampling' | 'storage' | 'investigation' | 'taxonomy';
}

/**
 * All MIxS slots the sample form can render. Always includes every entry;
 * priority bucketing is computed from the active combination class at render time.
 */
export const SAMPLE_FORM_SLOTS: SampleFormSlot[] = [
	// Core identity — always appear in the "What" header section, not here
	{ slot: 'samp_taxon_id', type: 'text', subset: 'taxonomy' },

	// Extension-specific location (only rendered when relevant)
	{ slot: 'depth', type: 'text', unit: 'm', subset: 'environment' },
	{ slot: 'elev', type: 'text', unit: 'm', subset: 'environment' },

	// Host context (only rendered when relevant extension)
	{ slot: 'host_taxid', type: 'text', subset: 'taxonomy' },
	{ slot: 'specific_host', type: 'text', subset: 'taxonomy' },

	// Environmental measurements
	{ slot: 'temp', type: 'number', unit: '°C', subset: 'environment' },
	{ slot: 'salinity', type: 'number', unit: 'PSU', subset: 'environment' },
	{ slot: 'ph', type: 'number', subset: 'environment' },
	{ slot: 'diss_oxygen', type: 'number', unit: 'mg/L', subset: 'environment' },
	{ slot: 'pressure', type: 'number', unit: 'atm', subset: 'environment' },
	{ slot: 'turbidity', type: 'number', unit: 'NTU', subset: 'environment' },
	{ slot: 'chlorophyll', type: 'number', unit: 'µg/L', subset: 'environment' },
	{ slot: 'nitrate', type: 'number', unit: 'µmol/L', subset: 'environment' },
	{ slot: 'phosphate', type: 'number', unit: 'µmol/L', subset: 'environment' },

	// Sampling process
	{ slot: 'samp_collect_device', type: 'select', constrainedCategory: 'samp_collect_device', subset: 'sampling' },
	{ slot: 'samp_collect_method', type: 'text', subset: 'sampling' },
	{ slot: 'samp_mat_process', type: 'textarea', colSpan: 2, subset: 'sampling' },
	{ slot: 'samp_size', type: 'text', subset: 'sampling' },
	{ slot: 'samp_vol_we_dna_ext', type: 'number', unit: 'mL', subset: 'sampling' },
	{ slot: 'size_frac', type: 'text', subset: 'sampling' },
	{ slot: 'filter_type', type: 'select', constrainedCategory: 'filter_type', subset: 'sampling' },
	{ slot: 'source_mat_id', type: 'text', colSpan: 2, subset: 'investigation' },

	// Sample storage
	{ slot: 'samp_store_sol', type: 'select', constrainedCategory: 'samp_store_sol', subset: 'storage' },
	{ slot: 'samp_store_temp', type: 'number', unit: '°C', subset: 'storage' },
	{ slot: 'samp_store_dur', type: 'text', subset: 'storage' },
	{ slot: 'samp_store_loc', type: 'text', subset: 'storage' },

	// Culture / reference — only rendered when the active combination class
	// actually carries these slots (typically MIGS-BA, MISAG, etc.)
	{ slot: 'ref_biomaterial', type: 'text', colSpan: 2, subset: 'investigation' },
	{ slot: 'isol_growth_condt', type: 'text', colSpan: 2, subset: 'investigation' }
];

/** Slots rendered explicitly in the form's header (not via the priority buckets). */
export const HEADER_SLOTS = new Set(['samp_name', 'collection_date', 'env_medium', 'mixs_checklist', 'extension']);

export type Priority = 'required' | 'recommended' | 'optional';

export interface OrganizedForm {
	required: SampleFormSlot[];
	recommended: SampleFormSlot[];
	optional: {
		environment: SampleFormSlot[];
		sampling: SampleFormSlot[];
		storage: SampleFormSlot[];
		investigation: SampleFormSlot[];
		taxonomy: SampleFormSlot[];
		other: SampleFormSlot[];
	};
}

/**
 * Bucket slots into Required / Recommended / Optional[subset] for the active
 * (checklist, extension). Emits:
 *
 *   - Required: every slot the combination class marks required (MIxS-
 *     authoritative), looked up against SAMPLE_FORM_SLOTS for UI hints and
 *     falling back to a plain text input when no config is curated.
 *   - Recommended: every slot the combination class marks recommended.
 *   - Optional[subset]: SampleTown's curated always-visible slots (measurements,
 *     sampling, storage, taxonomy) that aren't already required/recommended
 *     for this combo, grouped by subset.
 *
 * Reactivity comes from the caller's `$derived(organizeForm(...))` — every
 * time checklist or extension changes, this re-runs and the form re-renders.
 */
export function organizeForm(checklist: string, extension: string | null): OrganizedForm {
	const required = requiredSlotSet(checklist, extension);
	const recommended = recommendedSlotSet(checklist, extension);
	const configBySlot = new Map(SAMPLE_FORM_SLOTS.map((s) => [s.slot, s] as const));

	// Always-visible baseline so operators can enter these regardless of the
	// active class. Their contents shift between buckets as the class changes
	// (e.g. `depth` jumps Required↔Optional when switching Water↔BuiltEnvironment).
	const UNIVERSAL_OPTIONAL = new Set<string>([
		'depth', 'elev',
		'temp', 'salinity', 'ph', 'diss_oxygen', 'pressure', 'turbidity', 'chlorophyll', 'nitrate', 'phosphate',
		'samp_collect_device', 'samp_collect_method', 'samp_mat_process', 'samp_size',
		'samp_vol_we_dna_ext', 'size_frac', 'filter_type',
		'samp_store_sol', 'samp_store_temp', 'samp_store_dur', 'samp_store_loc',
		'samp_taxon_id'
	]);

	const out: OrganizedForm = {
		required: [],
		recommended: [],
		optional: { environment: [], sampling: [], storage: [], investigation: [], taxonomy: [], other: [] }
	};

	// 1. Required — every slot the combination class requires, in declared order.
	for (const slot of required) {
		if (HEADER_SLOTS.has(slot)) continue;
		out.required.push(configBySlot.get(slot) ?? defaultConfig(slot));
	}

	// 2. Recommended — every slot the combination class recommends.
	for (const slot of recommended) {
		if (HEADER_SLOTS.has(slot) || required.has(slot)) continue;
		out.recommended.push(configBySlot.get(slot) ?? defaultConfig(slot));
	}

	// 3. Optional — SampleTown's curated universal slots that aren't already
	//    above, grouped by subset.
	for (const entry of SAMPLE_FORM_SLOTS) {
		if (HEADER_SLOTS.has(entry.slot)) continue;
		if (required.has(entry.slot) || recommended.has(entry.slot)) continue;
		if (!UNIVERSAL_OPTIONAL.has(entry.slot)) continue;
		const bucket = entry.subset ?? subsetOfSlot(entry.slot);
		out.optional[bucket].push(entry);
	}
	return out;
}

/** Fallback config for an MIxS slot not in our curated SAMPLE_FORM_SLOTS. */
function defaultConfig(slot: string): SampleFormSlot {
	const meta = getSlot(slot);
	// MIxS ranges like `float`/`double`/`integer` → number input
	const isNumeric = meta?.range && /^(float|double|integer|decimal)$/i.test(meta.range);
	// Don't set subset on required/recommended entries — subset is only used
	// by the Optional bucket grouping.
	return { slot, type: isNumeric ? 'number' : 'text' };
}

function subsetOfSlot(slot: string): keyof OrganizedForm['optional'] {
	const meta = getSlot(slot);
	const subset = meta?.in_subset?.[0];
	if (subset === 'environment') return 'environment';
	if (subset === 'investigation' || subset === 'sequencing') return 'investigation';
	return 'other';
}
