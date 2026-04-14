/**
 * Checklist view helpers backed by the MIxS 6.3 schema index.
 *
 * Pre-6.3 this file hand-curated required/recommended field lists per
 * checklist. Those are now derived directly from the LinkML-materialized
 * combination classes in schema-index.ts, so any MIxS release bump
 * automatically updates the UI without code changes here.
 */
import {
	checklistOptions,
	extensionOptions,
	getClass,
	getCombinationClass,
	requiredSlotsFor,
	recommendedSlotsFor,
	allSlotsFor,
	type MixsClass
} from './schema-index';

export interface ChecklistInfo {
	id: string;
	name: string;
	description: string;
}

/**
 * LinkML `title:` overrides for a couple of checklists whose upstream titles
 * are the fully-spelled-out standard names ("Minimum Information About a
 * Single Amplified Genome") where every other checklist in the picker uses
 * the canonical acronym ("MIGS bacteria", "MIMARKS survey"). Keep the
 * dropdown internally consistent.
 */
const CHECKLIST_LABEL_OVERRIDES: Record<string, string> = {
	Misag: 'MISAG',
	Miuvig: 'MIUVIG'
};

/** Dropdown options for the top-level checklist picker. */
export const CHECKLIST_OPTIONS = checklistOptions().map((opt) => ({
	...opt,
	label: CHECKLIST_LABEL_OVERRIDES[opt.value] ?? opt.label
}));

/** Dropdown options for the extension (formerly env_package) picker. */
export const EXTENSION_OPTIONS = extensionOptions();

/** Metadata bundle for a checklist — title/description suitable for display. */
export function checklistInfo(checklist: string): ChecklistInfo | null {
	const c = getClass(checklist);
	if (!c || c.category !== 'checklist') return null;
	return { id: c.name, name: c.title, description: c.description ?? '' };
}

/** Metadata bundle for an extension. */
export function extensionInfo(extension: string): ChecklistInfo | null {
	const c = getClass(extension);
	if (!c || c.category !== 'extension') return null;
	return { id: c.name, name: c.title, description: c.description ?? '' };
}

/**
 * Required slots for a (checklist, extension) pair as a Set. Falls back to the
 * checklist-only required set if extension is null/absent.
 */
export function requiredSlotSet(checklist: string, extension: string | null): Set<string> {
	if (extension) return new Set(requiredSlotsFor(checklist, extension));
	const c = getClass(checklist);
	return new Set(c?.required ?? []);
}

/** Recommended slots (not required) for the same pair. */
export function recommendedSlotSet(checklist: string, extension: string | null): Set<string> {
	if (extension) return recommendedSlotsFor(checklist, extension);
	// With no extension we can still pull recommendeds from the checklist mixin.
	const result = new Set<string>();
	const c = getClass(checklist);
	if (c?.slot_usage) {
		for (const [slot, usage] of Object.entries(c.slot_usage)) {
			if (usage.recommended) result.add(slot);
		}
	}
	return result;
}

/** All slots (required + optional) applicable to a (checklist, extension). */
export function allSlotsSet(checklist: string, extension: string | null): Set<string> {
	if (extension) return new Set(allSlotsFor(checklist, extension));
	const c = getClass(checklist);
	return new Set(c?.properties ?? []);
}

/** Lookup the materialized combination class (for import/export to MIxS templates). */
export function combinationClass(checklist: string, extension: string): MixsClass | undefined {
	return getCombinationClass(checklist, extension);
}
