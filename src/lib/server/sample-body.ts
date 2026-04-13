/**
 * Split a POST/PUT body on the samples API into its real-column fields and
 * its "spill" fields that land in samples.custom_fields JSON.
 *
 * Any key the client sends that isn't a samples-table column gets routed
 * into custom_fields. This covers:
 *   - MIxS slots SampleTown doesn't have a dedicated column for (silicate,
 *     ammonium, bromide, size_frac_low, …) — ~100s of slots across the
 *     MIxS env/chem vocab. They land in custom_fields keyed by their
 *     canonical slot name, no prefix.
 *   - misc_param:<tag> custom user tags — kept verbatim (with prefix) so
 *     the form re-renders them as misc_param chips.
 *
 * On the way back out, the samples GET spreads custom_fields JSON into form
 * state — the form's organizeForm picks up bare-slot keys as MIxS-slot
 * inputs automatically.
 */

/** Every non-custom key the samples API will accept on a POST/PUT body. */
export const SAMPLE_CORE_KEYS = new Set<string>([
	// Routing / identity
	'id', 'project_id', 'site_id', 'mixs_checklist', 'extension',
	// MIxS core sample columns
	'samp_name', 'collection_date', 'env_medium',
	// Extension-specific location
	'depth', 'elev',
	// Host
	'host_taxid', 'specific_host',
	// Measurements
	'temp', 'salinity', 'ph', 'diss_oxygen', 'pressure', 'turbidity',
	'chlorophyll', 'nitrate', 'phosphate',
	// Sampling
	'samp_collect_device', 'samp_collect_method', 'samp_mat_process', 'samp_size',
	'size_frac', 'source_mat_id',
	// Storage
	'samp_store_sol', 'samp_store_temp', 'samp_store_dur', 'samp_store_loc', 'store_cond',
	// MIGS/MIMAG context
	'ref_biomaterial', 'isol_growth_condt', 'tax_ident',
	// SampleTown-local
	'filter_type', 'collector_name', 'notes', 'custom_fields',
	// Relationships / metadata the server interprets but doesn't write as a column
	'people', 'client_id', 'local_created_at'
]);

export function splitSampleBody(body: Record<string, unknown>): {
	core: Record<string, unknown>;
	customFields: Record<string, unknown>;
} {
	const core: Record<string, unknown> = {};
	const customFields: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(body)) {
		if (SAMPLE_CORE_KEYS.has(k)) {
			core[k] = v;
		} else if (v != null && v !== '') {
			customFields[k] = v;
		}
	}
	return { core, customFields };
}

/**
 * Merge spill-fields into the existing custom_fields payload. Client may
 * send `custom_fields` as a JSON string (legacy path) or omit it and let
 * the spill carry the load — handle both.
 */
export function mergeCustomFields(
	existing: unknown,
	spill: Record<string, unknown>
): string | null {
	let base: Record<string, unknown> = {};
	if (typeof existing === 'string' && existing.trim()) {
		try {
			const parsed = JSON.parse(existing);
			if (parsed && typeof parsed === 'object') base = parsed as Record<string, unknown>;
		} catch {
			/* ignore — existing was corrupt, spill wins */
		}
	}
	const merged = { ...base, ...spill };
	return Object.keys(merged).length ? JSON.stringify(merged) : null;
}
