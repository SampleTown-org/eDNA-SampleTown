import { z } from 'zod';

/**
 * Permit / license / MOU CRUD body schemas.
 *
 * Vocabulary for `permit_type` is GGBN Darwin Core permit-extension aligned.
 * Enforcement lives here rather than in a CHECK constraint because the GGBN
 * term list evolves between schema releases.
 *
 * Project linkage is derived (via sites.project_id), so requests never carry
 * project_ids directly — they only list the sites a permit should cover,
 * each with an optional validity window.
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

// Scope row: a (site, date-window) tuple. site_id is required — there is no
// "all sites" shortcut at the data-model level. The API upserts on
// (permit_id, site_id) so the same site listed twice is deduplicated.
const scopeShape = {
	site_id: idString,
	valid_from: optionalDate,
	valid_until: optionalDate,
	notes: optionalLongText
};

export const PermitCreateBody = z.object({
	...permitFields,
	// Scopes are optional on create so the UI can choose to create an inert
	// permit first and add site rows afterwards from the site detail page.
	scopes: z.array(z.object(scopeShape)).max(1000).optional()
});

export const PermitUpdateBody = z.object({
	...permitFields,
	scopes: z.array(z.object(scopeShape)).max(1000).optional()
});

/**
 * Body for adding a saved cart's site references to an existing permit.
 * Extracted every sample/site in the cart is flattened server-side to a set
 * of unique site_ids; the caller's valid_from/valid_until apply to every
 * new/updated scope row.
 */
export const AddCartToPermitBody = z.object({
	permit_id: idString,
	cart_id: idString,
	valid_from: optionalDate,
	valid_until: optionalDate
});
