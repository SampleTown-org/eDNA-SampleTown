/**
 * Server-side MIxS validator backed by the LinkML-generated JSON Schema.
 *
 * Lazy-loads the 14MB mixs.schema.json on first use and compiles a per-class
 * validator on demand. Compiled validators are cached. Import flows call
 * `validateRow(row, checklist, extension)` to get structured per-row errors
 * (missing required slot, pattern mismatch, range violation, enum violation).
 *
 * This file is server-only — never imported by client code, so the large
 * schema JSON doesn't leak into the PWA bundle.
 */
import Ajv, { type ValidateFunction, type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
// Static JSON import — Vite bundles the schema into the server chunk at build
// time so no runtime fs access is needed. Server-only file, so the large
// schema never reaches the client bundle.
import mixsSchema from '$lib/mixs/schema/v6.3.0/mixs.schema.json';

export interface MixsValidationError {
	slot: string;
	message: string;
	keyword: string;
}

let ajvInstance: Ajv | null = null;
const fullSchema = mixsSchema as unknown as Record<string, unknown>;
const compiledCache = new Map<string, ValidateFunction>();

function initAjv(): Ajv {
	if (ajvInstance) return ajvInstance;
	const ajv = new Ajv({
		strict: false,
		allErrors: true,
		// Disable format validation: the MIxS LinkML-generated JSON Schema
		// marks slots like collection_date as format:date-time even though the
		// MIxS spec explicitly allows right-truncated values (2008-01-23, 2008,
		// etc.). Pattern validation still runs and catches real format errors.
		validateFormats: false
	});
	addFormats(ajv);
	ajvInstance = ajv;
	return ajv;
}

/**
 * Get (or build) an ajv validator for a (checklist, extension) combination
 * class. Falls back to the checklist-only class if no combination is specified.
 * Returns null if the class doesn't exist in the active schema.
 */
export function getValidator(checklist: string, extension?: string | null): ValidateFunction | null {
	const className = extension ? `${checklist}${extension}` : checklist;
	const cached = compiledCache.get(className);
	if (cached) return cached;

	const defs = (fullSchema.$defs ?? fullSchema.definitions) as Record<string, unknown>;
	const classDef = defs?.[className];
	if (!classDef) return null;

	// Build a standalone sub-schema that references the class definition but
	// carries the full $defs so $ref lookups resolve.
	const ajv = initAjv();
	const subSchema = {
		$id: `mixs://${className}`,
		$defs: defs,
		$ref: `#/$defs/${className}`
	};
	const validator = ajv.compile(subSchema);
	compiledCache.set(className, validator);
	return validator;
}

/**
 * Validate a single row (sample record) against a MIxS combination class.
 * Unknown extension or checklist: returns empty error array rather than failing
 * — structural problems are reported by the caller, not the validator.
 */
export function validateRow(
	row: Record<string, unknown>,
	checklist: string,
	extension?: string | null
): MixsValidationError[] {
	const validator = getValidator(checklist, extension);
	if (!validator) return [];

	// Drop null/undefined/empty-string values so ajv doesn't mis-validate them
	// against pattern or format constraints (MIxS slots are effectively optional
	// when absent; "missing" sentinels are handled by the import parser upstream).
	const cleaned: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(row)) {
		if (v === null || v === undefined || v === '') continue;
		cleaned[k] = v;
	}

	if (validator(cleaned)) return [];

	const errors = (validator.errors ?? []) as ErrorObject[];
	return errors.map((e) => ({
		slot: e.instancePath.replace(/^\//, '') || (e.params?.missingProperty as string) || '?',
		message: formatError(e),
		keyword: e.keyword
	}));
}

function formatError(e: ErrorObject): string {
	switch (e.keyword) {
		case 'required':
			return `missing required slot: ${e.params?.missingProperty}`;
		case 'pattern':
			return `value does not match required pattern ${e.params?.pattern}`;
		case 'enum':
			return `value is not in allowed set (${(e.params?.allowedValues as unknown[])?.slice(0, 5).join(', ')}…)`;
		case 'type':
			return `expected ${e.params?.type}`;
		case 'format':
			return `invalid ${e.params?.format} format`;
		default:
			return e.message ?? e.keyword;
	}
}
