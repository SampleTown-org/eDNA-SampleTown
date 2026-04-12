/**
 * UI field configuration for the sample new/edit forms.
 *
 * This file is a thin "view layer" over the authoritative MIxS 6.3 slot
 * definitions in `schema-index.ts`. It picks which slots SampleTown surfaces
 * in its default form, how to group them, and app-specific UI hints (units,
 * picklist bindings). Authoritative metadata (title, description, examples,
 * pattern) lives in the generated schema index.
 */
import { getSlot } from './schema-index';

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'coordinates' | 'textarea';

export interface MixsFieldUi {
	/** MIxS slot name — must exist in the active schema index. */
	name: string;
	/** Override UI label; falls back to slot.title. */
	label?: string;
	type: FieldType;
	/** App-level required flag for the form; MIxS-level required is resolved
	 *  at runtime from (mixs_checklist, extension). */
	required?: boolean;
	/** Display-only unit hint. MIxS puts units inside the value string. */
	unit?: string;
	/** Name of a constrained_values picklist for select-type fields. */
	constrainedCategory?: string;
	/** Placeholder override; falls back to slot.examples[0]. */
	placeholder?: string;
}

export interface MixsField extends MixsFieldUi {
	label: string;
	description: string;
	required: boolean;
	examples: string[];
	pattern?: string;
	slot_uri?: string;
}

/** Resolve a UI config entry to a fully-populated MixsField by merging with the schema index. */
export function resolveField(ui: MixsFieldUi): MixsField {
	const slot = getSlot(ui.name);
	return {
		...ui,
		label: ui.label ?? slot?.title ?? ui.name,
		description: slot?.description ?? '',
		required: ui.required ?? slot?.required ?? false,
		examples: slot?.examples ?? [],
		pattern: slot?.structured_pattern ?? slot?.pattern,
		slot_uri: slot?.slot_uri,
		placeholder: ui.placeholder ?? slot?.examples?.[0]
	};
}

/** Core MIxS slots surfaced on every sample form. */
export const CORE_FIELDS: MixsFieldUi[] = [
	{ name: 'samp_name', type: 'text', required: true, label: 'Sample Name' },
	{ name: 'collection_date', type: 'date', required: true },
	{ name: 'env_medium', type: 'text', required: true, constrainedCategory: 'env_medium' },
	{ name: 'env_broad_scale', type: 'text', required: true, constrainedCategory: 'env_broad_scale' },
	{ name: 'env_local_scale', type: 'text', required: true, constrainedCategory: 'env_local_scale' },
	{ name: 'samp_taxon_id', type: 'text', required: false },
	{ name: 'project_name', type: 'text', required: false }
];

/** Extension-specific slots (MIxS 6.3 "Extension" = pre-6.3 "env_package"). */
export const EXTENSION_FIELDS: Record<string, MixsFieldUi[]> = {
	Water: [{ name: 'depth', type: 'text', required: true, unit: 'm' }],
	Sediment: [{ name: 'depth', type: 'text', required: true, unit: 'm' }],
	Soil: [{ name: 'elev', type: 'text', required: true, unit: 'm' }],
	Air: [{ name: 'elev', type: 'text', required: true, unit: 'm' }],
	HostAssociated: [
		{ name: 'host_taxid', type: 'text', required: true },
		{ name: 'specific_host', type: 'text', required: false }
	],
	PlantAssociated: [
		{ name: 'host_taxid', type: 'text', required: true },
		{ name: 'specific_host', type: 'text', required: false }
	],
	HumanAssociated: [{ name: 'host_taxid', type: 'text', required: true }],
	BuiltEnvironment: [],
	Agriculture: []
};

/** Physicochemical measurements (all optional — relevant per-extension). */
export const MEASUREMENT_FIELDS: MixsFieldUi[] = [
	{ name: 'temp', type: 'number', unit: '°C' },
	{ name: 'salinity', type: 'number', unit: 'PSU' },
	{ name: 'ph', type: 'number' },
	{ name: 'diss_oxygen', type: 'number', unit: 'mg/L' },
	{ name: 'pressure', type: 'number', unit: 'atm' },
	{ name: 'turbidity', type: 'number', unit: 'NTU' },
	{ name: 'chlorophyll', type: 'number', unit: 'µg/L' },
	{ name: 'nitrate', type: 'number', unit: 'µmol/L' },
	{ name: 'phosphate', type: 'number', unit: 'µmol/L' }
];

/** Sampling + storage logistics. */
export const LOGISTICS_FIELDS: MixsFieldUi[] = [
	{ name: 'samp_vol_we_dna_ext', type: 'number', unit: 'mL' },
	{ name: 'filter_type', type: 'select', constrainedCategory: 'filter_type' },
	{ name: 'samp_collect_device', type: 'text', constrainedCategory: 'samp_collect_device' },
	{ name: 'samp_mat_process', type: 'textarea' },
	{ name: 'samp_store_sol', type: 'select', constrainedCategory: 'samp_store_sol' },
	{ name: 'samp_store_temp', type: 'number', unit: '°C' },
	{ name: 'samp_store_dur', type: 'text' },
	{ name: 'samp_store_loc', type: 'text' }
];

/** Get all required fields for a given MIxS extension. */
export function getRequiredFields(extension: string | null): MixsField[] {
	const ext = extension && EXTENSION_FIELDS[extension] ? EXTENSION_FIELDS[extension] : [];
	return [...CORE_FIELDS, ...ext].map(resolveField);
}

/** Get all fields organized by section, for form rendering. */
export function getAllFieldSections(extension: string | null) {
	return {
		core: CORE_FIELDS.map(resolveField),
		extension: (extension && EXTENSION_FIELDS[extension] ? EXTENSION_FIELDS[extension] : []).map(resolveField),
		measurements: MEASUREMENT_FIELDS.map(resolveField),
		logistics: LOGISTICS_FIELDS.map(resolveField)
	};
}
