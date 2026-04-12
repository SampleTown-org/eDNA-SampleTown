import type { Sample } from '$lib/types';
import { CORE_FIELDS, EXTENSION_FIELDS, resolveField } from './fields';
import { requiredSlotSet } from './checklists';

export interface ValidationError {
	field: string;
	message: string;
}

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
	/** 0-100 % of required fields present. */
	completeness: number;
}

/**
 * Validate a partial sample against the MIxS requirements for its
 * (mixs_checklist, extension) pair. MIxS-level required slots come from the
 * schema-index (authoritative); SampleTown-level form requireds come from
 * fields.ts.
 */
export function validateSample(sample: Partial<Sample>): ValidationResult {
	const errors: ValidationError[] = [];
	const checklist = sample.mixs_checklist ?? 'MimarksS';
	const extension = sample.extension ?? null;

	// Every slot the MIxS combination class marks required.
	const mixsRequired = requiredSlotSet(checklist, extension);

	// App-level required fields (usually a subset of mixsRequired that we
	// surface on the default form; may add non-MIxS fields like samp_name).
	const appFields = [...CORE_FIELDS, ...(extension && EXTENSION_FIELDS[extension] ? EXTENSION_FIELDS[extension] : [])].map(resolveField);

	for (const field of appFields) {
		if (!field.required && !mixsRequired.has(field.name)) continue;
		const value = (sample as Record<string, unknown>)[field.name];
		if (!isPresent(value)) {
			errors.push({ field: field.name, message: `${field.label} is required` });
		} else if (field.pattern && typeof value === 'string' && !new RegExp(field.pattern).test(value)) {
			errors.push({ field: field.name, message: `${field.label} format is invalid` });
		}
	}

	// Any MIxS-required slots not covered by the default form.
	const appFieldNames = new Set(appFields.map((f) => f.name));
	for (const slot of mixsRequired) {
		if (appFieldNames.has(slot)) continue;
		const value = (sample as Record<string, unknown>)[slot];
		if (!isPresent(value)) {
			errors.push({ field: slot, message: `${slot} is required by MIxS ${checklist}${extension ? '/' + extension : ''}` });
		}
	}

	const totalRequired = appFields.filter((f) => f.required).length + Math.max(0, mixsRequired.size - appFieldNames.size);
	const missingRequired = errors.length;
	const completeness = totalRequired > 0 ? Math.round(((totalRequired - missingRequired) / totalRequired) * 100) : 100;

	return { valid: errors.length === 0, errors, completeness };
}

function isPresent(v: unknown): boolean {
	return v !== null && v !== undefined && v !== '';
}

/** Parse lat_lon string to {latitude, longitude}. MIxS format: 'dd.dddd N dd.dddd W'. */
export function parseLatLon(latLon: string): { latitude: number; longitude: number } | null {
	const match = latLon.match(/^(-?\d+(?:\.\d+)?)\s*([NS])?\s+(-?\d+(?:\.\d+)?)\s*([WE])?$/i);
	if (!match) return null;
	let latitude = parseFloat(match[1]);
	let longitude = parseFloat(match[3]);
	if (match[2]?.toUpperCase() === 'S') latitude = -Math.abs(latitude);
	if (match[4]?.toUpperCase() === 'W') longitude = -Math.abs(longitude);
	return { latitude, longitude };
}

/** Format lat/lon numbers to MIxS lat_lon string. */
export function formatLatLon(latitude: number, longitude: number): string {
	const ns = latitude >= 0 ? 'N' : 'S';
	const ew = longitude >= 0 ? 'E' : 'W';
	return `${Math.abs(latitude).toFixed(4)} ${ns} ${Math.abs(longitude).toFixed(4)} ${ew}`;
}
