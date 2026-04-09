import type { EnvPackage, MixsChecklist, Sample } from '$lib/types';
import { CORE_FIELDS, PACKAGE_FIELDS } from './fields';
import { CHECKLISTS } from './checklists';

export interface ValidationError {
	field: string;
	message: string;
}

export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
	completeness: number; // 0-100 percentage of required fields filled
}

/** Validate a sample against its MIxS checklist and env_package */
export function validateSample(sample: Partial<Sample>): ValidationResult {
	const errors: ValidationError[] = [];
	const envPackage = (sample.env_package || 'water') as EnvPackage;
	const checklist = (sample.mixs_checklist || 'MIMARKS-SU') as MixsChecklist;

	// Check core required fields
	for (const field of CORE_FIELDS) {
		if (field.required) {
			const value = sample[field.name as keyof Sample];
			if (!value && value !== 0) {
				errors.push({ field: field.name, message: `${field.label} is required` });
			} else if (field.pattern && typeof value === 'string' && !field.pattern.test(value)) {
				errors.push({ field: field.name, message: `${field.label} format is invalid` });
			}
		}
	}

	// Check env_package-specific required fields
	const packageFields = PACKAGE_FIELDS[envPackage] || [];
	for (const field of packageFields) {
		if (field.required) {
			const value = sample[field.name as keyof Sample];
			if (!value && value !== 0) {
				errors.push({
					field: field.name,
					message: `${field.label} is required for ${envPackage} samples`
				});
			}
		}
	}

	// Check checklist-specific required fields
	const checklistInfo = CHECKLISTS[checklist];
	if (checklistInfo) {
		for (const fieldName of checklistInfo.requiredFields) {
			// These fields may be on the sample or on related entities (PCR, sequencing run)
			// Only validate fields that exist on the sample table
			const value = sample[fieldName as keyof Sample];
			if (fieldName in sampleFieldNames && !value && value !== 0) {
				errors.push({
					field: fieldName,
					message: `${fieldName} is required for ${checklistInfo.name}`
				});
			}
		}
	}

	// Calculate completeness
	const totalRequired = CORE_FIELDS.filter((f) => f.required).length + packageFields.filter((f) => f.required).length;
	const filledRequired = totalRequired - errors.filter((e) =>
		[...CORE_FIELDS, ...packageFields].some((f) => f.name === e.field && f.required)
	).length;
	const completeness = totalRequired > 0 ? Math.round((filledRequired / totalRequired) * 100) : 100;

	return {
		valid: errors.length === 0,
		errors,
		completeness
	};
}

/** Parse lat_lon string to {latitude, longitude} */
export function parseLatLon(latLon: string): { latitude: number; longitude: number } | null {
	const match = latLon.match(/^(\d+(?:\.\d+)?)\s([NS])\s(\d+(?:\.\d+)?)\s([WE])$/);
	if (!match) return null;

	let latitude = parseFloat(match[1]);
	let longitude = parseFloat(match[3]);

	if (match[2] === 'S') latitude = -latitude;
	if (match[4] === 'W') longitude = -longitude;

	return { latitude, longitude };
}

/** Format lat/lon numbers to MIxS lat_lon string */
export function formatLatLon(latitude: number, longitude: number): string {
	const ns = latitude >= 0 ? 'N' : 'S';
	const ew = longitude >= 0 ? 'E' : 'W';
	return `${Math.abs(latitude).toFixed(4)} ${ns} ${Math.abs(longitude).toFixed(4)} ${ew}`;
}

// Fields that exist on the sample table (vs. related entities)
const sampleFieldNames: Record<string, boolean> = {
	assembly_software: true,
	number_of_contigs: true,
	genome_coverage: true,
	reference_genome: true,
	annotation_source: true
};
