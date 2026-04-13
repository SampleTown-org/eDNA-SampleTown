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
 * Bucket SAMPLE_FORM_SLOTS into required/recommended/optional for the active
 * (checklist, extension). A slot is only surfaced if the combination class
 * actually contains it (so e.g. MigsBa-specific slots vanish on MimarksS) —
 * UNLESS the slot is in the universal "always-show" set (measurements,
 * storage, sampling), which every form carries regardless.
 */
export function organizeForm(checklist: string, extension: string | null): OrganizedForm {
	const required = requiredSlotSet(checklist, extension);
	const recommended = recommendedSlotSet(checklist, extension);

	// Slots that we surface on every sample form regardless of combination class.
	// These are SampleTown's opinionated baseline — any operator can use them
	// even when the active MIxS class doesn't list them.
	const universal = new Set<string>([
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

	for (const entry of SAMPLE_FORM_SLOTS) {
		if (HEADER_SLOTS.has(entry.slot)) continue;

		const inUniversal = universal.has(entry.slot);
		// schema-index properties list for the active class — drives whether
		// non-universal slots (host_taxid, ref_biomaterial, isol_growth_condt) show
		const inClass = required.has(entry.slot) || recommended.has(entry.slot);
		if (!inUniversal && !inClass) continue;

		if (required.has(entry.slot)) out.required.push(entry);
		else if (recommended.has(entry.slot)) out.recommended.push(entry);
		else {
			const bucket = entry.subset ?? subsetOfSlot(entry.slot) ?? 'other';
			out.optional[bucket].push(entry);
		}
	}
	return out;
}

function subsetOfSlot(slot: string): OrganizedForm['optional'] extends infer O ? keyof O : never {
	const meta = getSlot(slot);
	const subset = meta?.in_subset?.[0];
	if (subset === 'environment') return 'environment';
	if (subset === 'investigation') return 'investigation';
	return 'other' as const;
}
