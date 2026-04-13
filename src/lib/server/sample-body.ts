/**
 * Split a POST/PUT body on the samples API into its real-column fields and
 * its "spill" fields that land in the sample_values EAV table (one row per
 * slot, no JSON blob). Any key the client sends that isn't a samples-table
 * column is treated as spill — covers:
 *   - MIxS slots SampleTown doesn't have a column for (silicate, ammonium,
 *     bromide, size_frac_low, isol_growth_condt, …) — stored with the
 *     canonical slot name as the row key.
 *   - misc_param:<tag> user tags — keep the prefix verbatim so the form
 *     re-renders them as misc_param chips.
 */
import type Database from 'better-sqlite3';

/** Every non-spill key the samples API will accept on a POST/PUT body. */
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
	'filter_type', 'collector_name', 'notes',
	// Not persisted as a sample column but consumed by the API layer
	'people', 'client_id', 'local_created_at'
]);

export function splitSampleBody(body: Record<string, unknown>): {
	core: Record<string, unknown>;
	values: Record<string, string>;
} {
	const core: Record<string, unknown> = {};
	const values: Record<string, string> = {};
	for (const [k, v] of Object.entries(body)) {
		if (SAMPLE_CORE_KEYS.has(k)) {
			core[k] = v;
			continue;
		}
		if (v == null || v === '') continue;
		values[k] = typeof v === 'string' ? v : String(v);
	}
	return { core, values };
}

/**
 * Replace the sample_values rows for a sample with `values`. Any slot NOT
 * in `values` gets deleted from sample_values; each entry in `values` is
 * upserted.
 */
export function replaceSampleValues(
	db: Database.Database,
	sampleId: string,
	values: Record<string, string>
): void {
	const keep = Object.keys(values);
	const run = db.transaction(() => {
		// Delete rows not in `values`
		if (keep.length === 0) {
			db.prepare('DELETE FROM sample_values WHERE sample_id = ?').run(sampleId);
		} else {
			const placeholders = keep.map(() => '?').join(',');
			db.prepare(`DELETE FROM sample_values WHERE sample_id = ? AND slot NOT IN (${placeholders})`)
				.run(sampleId, ...keep);
		}
		const upsert = db.prepare(
			`INSERT INTO sample_values (sample_id, slot, value) VALUES (?, ?, ?)
			 ON CONFLICT (sample_id, slot) DO UPDATE SET value = excluded.value`
		);
		for (const [slot, value] of Object.entries(values)) upsert.run(sampleId, slot, value);
	});
	run();
}

/** Insert all `values` for a new sample (no reconciliation needed). */
export function insertSampleValues(
	db: Database.Database,
	sampleId: string,
	values: Record<string, string>
): void {
	if (Object.keys(values).length === 0) return;
	const insert = db.prepare('INSERT INTO sample_values (sample_id, slot, value) VALUES (?, ?, ?)');
	const run = db.transaction(() => {
		for (const [slot, value] of Object.entries(values)) insert.run(sampleId, slot, value);
	});
	run();
}

/** Read all sample_values for a sample as a Record<slot, value>. */
export function loadSampleValues(db: Database.Database, sampleId: string): Record<string, string> {
	const rows = db.prepare('SELECT slot, value FROM sample_values WHERE sample_id = ?').all(sampleId) as { slot: string; value: string | null }[];
	const out: Record<string, string> = {};
	for (const r of rows) {
		if (r.value != null) out[r.slot] = r.value;
	}
	return out;
}
