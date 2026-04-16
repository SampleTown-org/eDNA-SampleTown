import { z } from 'zod';

/**
 * Permit / license / MOU CRUD body schemas.
 *
 * Vocabulary for `permit_type` is GGBN Darwin Core permit-extension aligned.
 * Enforcement lives here rather than in a CHECK constraint because the GGBN
 * term list evolves between schema releases and we want to update one file
 * when that happens, not `schema.sql` too.
 *
 * Conventions copied from schemas/lab.ts:
 *  - SHORT_TEXT / LONG_TEXT length caps
 *  - Empty strings coerced to null
 *  - 32-char hex id validation
 *  - Unknown fields silently stripped
 */

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

const ID_REGEX = /^[0-9a-f]{32}$/;
const idString = z.string().regex(ID_REGEX, 'must be a 32-char hex id');

const optionalId = z.preprocess(
	(v) => (typeof v === 'string' && v.trim() === '' ? null : v),
	idString.nullable().optional()
);

const optionalDate = z.preprocess(
	(v) => (typeof v === 'string' && v.trim() === '' ? null : v),
	z.string().max(40).nullable().optional()
);

// GGBN permit-extension vocabulary. Kept in sync with the PermitType union in
// src/lib/types.ts — if you add a term, update both files.
const permitTypeEnum = z.enum([
	'collecting',
	'export',
	'import',
	'ircc',
	'pic',
	'mat',
	'mta',
	'ethics',
	'community_agreement',
	'dua',
	'other'
]);

const permitFields = {
	permit_type: permitTypeEnum,
	name: z.string().trim().min(1).max(200),
	identifier: optionalShortText,
	issuer: optionalShortText,
	jurisdiction: optionalShortText,
	document_url: z.preprocess(
		(v) => (typeof v === 'string' && v.trim() === '' ? null : v),
		z.string().max(2000).nullable().optional()
	),
	notes: optionalLongText
};

const scopeShape = {
	// Null site_id means "every site in the linked projects" — the shorthand
	// that lets operators attach a permit to a project without enumerating
	// every site.
	site_id: optionalId,
	valid_from: optionalDate,
	valid_until: optionalDate,
	notes: optionalLongText
};

export const PermitCreateBody = z.object({
	...permitFields,
	// Optional on create so the form can attach projects/scopes in the same
	// call. Empty array = draft permit that doesn't cover anything yet.
	project_ids: z.array(idString).max(1000).optional(),
	scopes: z.array(z.object(scopeShape)).max(1000).optional()
});

export const PermitUpdateBody = z.object({
	...permitFields,
	project_ids: z.array(idString).max(1000).optional(),
	scopes: z.array(z.object(scopeShape)).max(1000).optional()
});

export const PermitScopeCreateBody = z.object(scopeShape);
export const PermitScopeUpdateBody = z.object(scopeShape);
