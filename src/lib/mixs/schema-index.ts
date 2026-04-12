/**
 * Runtime loader for the MIxS schema index (output of scripts/mixs-build-index.mjs).
 *
 * Single active version is pointed at by MIXS_ACTIVE_VERSION below. Multiple
 * versions can coexist on disk — use `loadVersion(v)` for explicit version
 * lookup (import/export against a pinned schema).
 */
import slotsBundle from './generated/v6.3.0/slots.json';
import classesBundle from './generated/v6.3.0/classes.json';
import enumsBundle from './generated/v6.3.0/enums.json';

export const MIXS_ACTIVE_VERSION = '6.3.0';

// -- Types --------------------------------------------------------------

export interface MixsSlot {
	name: string;
	title?: string;
	description?: string;
	comments?: string[];
	examples?: string[];
	aliases?: string[];
	keywords?: string[];
	range?: string;
	multivalued?: boolean;
	required?: boolean;
	recommended?: boolean;
	pattern?: string;
	structured_pattern?: string;
	slot_uri?: string;
	see_also?: string[];
	in_subset?: string[];
}

export interface MixsEnum {
	name: string;
	title?: string;
	description?: string;
	comments?: string[];
	values: { value: string; meaning?: string; description?: string; aliases?: string[] }[];
}

export type ClassCategory = 'checklist' | 'extension' | 'combination' | 'mixin' | 'other';

/**
 * In MIxS 6.3 the former "env_package" concept is now formally an Extension
 * (is_a: Extension in LinkML). Extensions are associated with a sample to
 * contribute extra suggested/required fields — most are environment-based
 * (Water, Soil, Sediment, HostAssociated) but the term is broader and allows
 * for future non-environmental extensions.
 */

export interface MixsClass {
	name: string;
	title: string;
	description?: string;
	category: ClassCategory;
	checklist?: string;
	extension?: string;
	is_a?: string;
	mixins?: string[];
	mixin?: boolean;
	class_uri?: string;
	aliases?: string[];
	slots?: string[];
	properties?: string[];
	required?: string[];
	slot_usage?: Record<string, { required?: boolean; recommended?: boolean; examples?: string[] }>;
}

// -- Active-version convenience wrappers --------------------------------

const slots: Record<string, MixsSlot> = (slotsBundle as any).slots;
const classes: Record<string, MixsClass> = (classesBundle as any).classes;
const enums: Record<string, MixsEnum> = (enumsBundle as any).enums;

/** Get metadata for a MIxS slot (returns undefined if the slot doesn't exist in the active version). */
export function getSlot(name: string): MixsSlot | undefined {
	return slots[name];
}

export function getClass(name: string): MixsClass | undefined {
	return classes[name];
}

export function getEnum(name: string): MixsEnum | undefined {
	return enums[name];
}

/** All slot names known to the active schema, in declaration order. */
export function allSlotNames(): string[] {
	return Object.keys(slots);
}

/** All checklist class names (e.g. 'MigsBa', 'Mims', 'Mimarks', 'MimsMisip'). */
export function listChecklists(): MixsClass[] {
	return Object.values(classes).filter((c) => c.category === 'checklist');
}

/** All Extension class names (formerly env_packages in pre-6.3). */
export function listExtensions(): MixsClass[] {
	return Object.values(classes).filter((c) => c.category === 'extension');
}

/**
 * Resolve the materialized combination class for a (checklist, extension) pair.
 * Returns undefined if no such combination exists in the active schema.
 */
export function getCombinationClass(checklist: string, extension: string): MixsClass | undefined {
	return classes[`${checklist}${extension}`];
}

/**
 * Required slot names for a given (checklist, extension). Reads directly from
 * the JSON-Schema-materialized combination class so it reflects the union of
 * core + checklist + env-package requirements.
 */
export function requiredSlotsFor(checklist: string, extension: string): string[] {
	const cls = getCombinationClass(checklist, extension);
	return cls?.required ?? [];
}

/**
 * All slots (required + optional) that apply to a (checklist, extension).
 * Sourced from the materialized combination class's `properties` list.
 */
export function allSlotsFor(checklist: string, extension: string): string[] {
	const cls = getCombinationClass(checklist, extension);
	return cls?.properties ?? [];
}

/**
 * Whether a slot is recommended (but not required) for a (checklist, extension).
 * Reads per-class slot_usage overrides from the mixin classes.
 */
export function recommendedSlotsFor(checklist: string, extension: string): Set<string> {
	const result = new Set<string>();
	for (const className of [checklist, extension, `${checklist}${extension}`]) {
		const cls = classes[className];
		if (!cls?.slot_usage) continue;
		for (const [slot, usage] of Object.entries(cls.slot_usage)) {
			if (usage.recommended) result.add(slot);
		}
	}
	return result;
}

/** Human-facing MIxS checklist labels for dropdowns. */
export function checklistOptions(): { value: string; label: string; description?: string }[] {
	return listChecklists().map((c) => ({
		value: c.name,
		label: c.title ?? c.name,
		description: c.description
	}));
}

export function extensionOptions(): { value: string; label: string; description?: string }[] {
	return listExtensions().map((c) => ({
		value: c.name,
		label: c.title ?? c.name,
		description: c.description
	}));
}
