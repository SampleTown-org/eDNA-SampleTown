import { z } from 'zod';

/**
 * Request body schemas for the lab CRUD endpoints (sequencing runs, PCR
 * plates, library plates). Mirrors the conventions in `auth.ts`:
 *
 *  - Length caps everywhere (200 / 10000) so a buggy client can't write
 *    multi-megabyte rows
 *  - Enums match the SQLite CHECK constraints in schema.sql exactly so the
 *    400 happens before the DB throws
 *  - Empty strings are coerced to null on optional fields
 *  - Number fields accept either a number or a numeric string (forms send
 *    strings sometimes), and reject anything that doesn't parse
 *  - The `people` array is intentionally `unknown` — it's run through
 *    `normalizePeople()` in entity-personnel.ts which already filters and
 *    shapes it. Duplicating that here would just be drift waiting to happen.
 *  - Unknown fields are silently stripped (zod default)
 */

// ----------------------------------------------------------------------------
// shared helpers
// ----------------------------------------------------------------------------

const SHORT_TEXT = z.string().max(200);
const LONG_TEXT = z.string().max(10_000);

const optionalShortText = z.preprocess(
	(v) => (typeof v === 'string' && v.trim() === '' ? null : v),
	SHORT_TEXT.nullable().optional()
);

const optionalLongText = z.preprocess(
	(v) => (typeof v === 'string' && v.trim() === '' ? null : v),
	LONG_TEXT.nullable().optional()
);

// `generateId()` produces 32-char lowercase hex.
const ID_REGEX = /^[0-9a-f]{32}$/;
const idString = z.string().regex(ID_REGEX, 'must be a 32-char hex id');

const optionalId = z.preprocess(
	(v) => (typeof v === 'string' && v.trim() === '' ? null : v),
	idString.nullable().optional()
);

// Date/datetime strings are stored as TEXT — accept any short string and let
// the UI control the format. Empty strings → null.
const optionalDate = z.preprocess(
	(v) => (typeof v === 'string' && v.trim() === '' ? null : v),
	z.string().max(40).nullable().optional()
);

// `custom_fields` is a TEXT column that holds JSON-encoded user data. Cap it
// hard so the row stays a sane size.
const optionalCustomFields = z.preprocess(
	(v) => (typeof v === 'string' && v.trim() === '' ? null : v),
	z.string().max(10_000).nullable().optional()
);

// Number / int with string coercion: forms can submit "100" instead of 100.
// Empty string and null both become null.
const optionalNumber = z.preprocess((v) => {
	if (v === '' || v == null) return null;
	if (typeof v === 'string') {
		const n = Number(v);
		return Number.isFinite(n) ? n : v;
	}
	return v;
}, z.number().nullable().optional());

const optionalInt = z.preprocess((v) => {
	if (v === '' || v == null) return null;
	if (typeof v === 'string') {
		const n = Number(v);
		return Number.isFinite(n) ? Math.trunc(n) : v;
	}
	return v;
}, z.number().int().nullable().optional());

// `band_observed` and similar 0/1 columns: accept boolean / 0 / 1 / null,
// normalize to 0 | 1 | null.
const optionalBoolish = z.preprocess(
	(v) => {
		if (v == null || v === '') return null;
		if (typeof v === 'boolean') return v ? 1 : 0;
		if (v === 0 || v === 1) return v;
		return v;
	},
	z.union([z.literal(0), z.literal(1), z.null()]).optional()
);

// `people` is normalized downstream by normalizePeople(); keep it loose here.
const peopleField = z.unknown().optional();

// ----------------------------------------------------------------------------
// enums (kept in sync with CHECK constraints in src/lib/server/schema.sql)
// ----------------------------------------------------------------------------

// library_type is operator-managed picklist vocabulary — no
// hardcoded enum, just a non-empty string up to SHORT_TEXT length. The DB
// column is NOT NULL so we require a value, but the picklist is the sole
// source of truth for what values are valid.
const LIBRARY_TYPE = z.string().trim().min(1).max(200);

// library_plates.platform allows 'other'; sequencing_runs.platform does not.
const PLATFORM_WITH_OTHER = z.enum([
	'ILLUMINA',
	'OXFORD_NANOPORE',
	'PACBIO',
	'ION_TORRENT',
	'other'
]);
const PLATFORM_STRICT = z.enum(['ILLUMINA', 'OXFORD_NANOPORE', 'PACBIO', 'ION_TORRENT']);

const optionalPlatformWithOther = z.preprocess(
	(v) => (typeof v === 'string' && v.trim() === '' ? null : v),
	PLATFORM_WITH_OTHER.nullable().optional()
);

// ============================================================================
// /api/runs
// ============================================================================

// Only run_name is required at create time. Platform is filled in later if
// needed; it's nullable on the runs table.
const optionalPlatformStrict = z.preprocess(
	(v) => (typeof v === 'string' && v.trim() === '' ? null : v),
	PLATFORM_STRICT.nullable().optional()
);

const runFields = {
	run_name: z.string().trim().min(1).max(200),
	run_date: optionalDate,
	platform: optionalPlatformStrict,
	instrument_model: optionalShortText,
	flow_cell_id: optionalShortText,
	run_directory: optionalShortText,
	fastq_directory: optionalShortText,
	total_reads: optionalInt,
	total_bases: optionalInt,
	notes: optionalLongText
};

export const RunCreateBody = z.object({
	...runFields,
	custom_fields: optionalCustomFields,
	library_ids: z.array(idString).max(10_000).optional(),
	people: peopleField
});

export const RunUpdateBody = z.object({
	...runFields,
	library_ids: z.array(idString).max(10_000).optional(),
	people: peopleField
});

// ============================================================================
// /api/pcr-plates
// ============================================================================

const pcrReaction = z.object({
	extract_id: idString,
	pcr_name: z.string().trim().min(1).max(200),
	well_label: optionalShortText,
	band_observed: optionalBoolish,
	concentration_ng_ul: optionalNumber,
	notes: optionalLongText
});

const pcrPlateFields = {
	plate_name: z.string().trim().min(1).max(200),
	pcr_date: optionalDate,
	primer_set_id: optionalId,
	target_subfragment: optionalShortText,
	forward_primer_name: optionalShortText,
	forward_primer_seq: optionalShortText,
	reverse_primer_name: optionalShortText,
	reverse_primer_seq: optionalShortText,
	pcr_cond: optionalLongText,
	annealing_temp_c: optionalNumber,
	num_cycles: optionalInt,
	polymerase: optionalShortText,
	nucl_acid_amp: optionalLongText,
	notes: optionalLongText
};

export const PcrPlateCreateBody = z.object({
	...pcrPlateFields,
	custom_fields: optionalCustomFields,
	reactions: z.array(pcrReaction).max(1000).optional(),
	people: peopleField
});

export const PcrPlateUpdateBody = z.object({
	...pcrPlateFields,
	people: peopleField
});

// ============================================================================
// /api/library-plates
// ============================================================================

const libraryPrepRow = z.object({
	pcr_id: optionalId,
	extract_id: optionalId,
	library_name: z.string().trim().min(1).max(200),
	well_label: optionalShortText,
	index_sequence_i7: optionalShortText,
	index_sequence_i5: optionalShortText,
	barcode: optionalShortText,
	final_concentration_ng_ul: optionalNumber,
	notes: optionalLongText
});

const libraryPlateFields = {
	plate_name: z.string().trim().min(1).max(200),
	library_prep_date: optionalDate,
	library_source: optionalShortText,
	library_selection: optionalShortText,
	library_prep_kit: optionalShortText,
	platform: optionalPlatformWithOther,
	instrument_model: optionalShortText,
	fragment_size_bp: optionalInt,
	notes: optionalLongText
};

export const LibraryPlateCreateBody = z.object({
	...libraryPlateFields,
	library_type: LIBRARY_TYPE.default('16S_amplicon'),
	pcr_plate_id: optionalId,
	custom_fields: optionalCustomFields,
	libraries: z.array(libraryPrepRow).max(1000).optional(),
	people: peopleField
});

export const LibraryPlateUpdateBody = z.object({
	...libraryPlateFields,
	library_type: LIBRARY_TYPE,
	people: peopleField
});
