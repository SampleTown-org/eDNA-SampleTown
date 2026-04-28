/**
 * MIxS 6.3 TSV import/export.
 *
 * Column headers in emitted TSVs are MIxS slot names verbatim (plus leading `*`
 * for MIxS-mandatory slots). Headers in imported TSVs are matched against the
 * active MIxS schema slot names; unknown headers are flagged for the column
 * mapper. This replaces the pre-6.3 hand-rolled SRA-column alias table.
 *
 * Phase 4 will layer per-(checklist, extension) template selection + ajv
 * validation on top of this. For now: plain MIxS slot-name columns.
 */
import { getDb } from './db';
import { allSlotNames, getSlot, getClass, getCombinationClass } from '$lib/mixs/schema-index';
import { slotTable } from '$lib/mixs/slot-ownership';
import { SRA_TO_MIXS } from '$lib/mixs/sra-mapping';
import { sanitizeMiscParamName, MISC_PARAM_PREFIX } from '$lib/mixs/sample-form';
import * as XLSX from 'xlsx';

/** Fields that live on the sites table, not the samples table. */
export const SITE_FIELDS = new Set([
	'site_name', 'site_code', 'lat_lon', 'latitude', 'longitude', 'geo_loc_name',
	'env_broad_scale', 'env_local_scale'
]);

/** Fields that select/create the project a sample belongs to. Resolved to
 *  project_id in the import endpoint. Kept to the bare minimum: the lookup key.
 *  Other project metadata (pi_name, institution, funding) is filled in through
 *  the normal project edit UI after import. */
export const PROJECT_FIELDS = new Set(['project_name']);

/** Fields that get split off into an extracts row when present. Mirrors the
 *  site auto-create pattern: if any of these are filled for a given sample,
 *  an extract record is created after the sample insert in the same txn. */
export const EXTRACT_FIELDS = new Set([
	'extract_name', 'extraction_date', 'concentration_ng_ul',
	'storage_box', 'storage_location', 'extract_notes'
]);

/** Fields that get split off into a library_preps row when present. The
 *  importer creates one library per row (linked to the row's just-created
 *  extract). When run_* fields are also present, a run_libraries link is
 *  added connecting the library to the resolved run. */
export const LIBRARY_FIELDS = new Set([
	'library_name', 'library_barcode', 'library_prep_kit', 'library_prep_date',
	'library_platform', 'library_instrument_model', 'library_concentration_ng_ul',
	'library_notes'
]);

/** Fields that get split off into a sequencing_runs row when present. Runs
 *  are deduped within a batch by run_name — multiple samples on the same
 *  flow cell share one run record. The link table run_libraries carries
 *  per-(run, library) details (fastq directory, read count). */
export const RUN_FIELDS = new Set([
	'run_name', 'run_date', 'run_platform', 'run_instrument_model',
	'run_flow_cell_id', 'run_directory', 'run_total_bases_gb',
	// Per-(run, library) link fields — written to run_libraries, not
	// sequencing_runs. Side-car bag is shared with the run for parsing.
	'run_fastq_dir', 'run_read_count'
]);

/** Sample columns that exist as real columns in the samples table and are
 *  MIxS slots. Kept explicit so we don't accidentally expose sync internals.
 *  Exported so the API can distinguish "real column" from "spill into custom_fields". */
export const SAMPLE_SLOT_COLUMNS = [
	// MIxS core
	'samp_name', 'collection_date', 'env_medium',
	// Extension-specific location
	'depth', 'elev',
	// Host-associated
	'host_taxid', 'specific_host',
	// Measurements
	'temp', 'salinity', 'ph', 'diss_oxygen', 'pressure', 'turbidity', 'chlorophyll', 'nitrate', 'phosphate',
	// Sampling
	'samp_collect_device', 'samp_collect_method', 'samp_mat_process', 'samp_size',
	'size_frac', 'source_mat_id',
	// Storage
	'samp_store_sol', 'samp_store_temp', 'samp_store_dur', 'samp_store_loc', 'store_cond',
	// MIGS/MIMAG context
	'ref_biomaterial', 'isol_growth_condt', 'tax_ident'
	// Joined in at export time from downstream tables:
	//   samp_taxon_id / samp_vol_we_dna_ext / pool_dna_extracts / nucl_acid_ext → extracts
	//   nucl_acid_amp → pcr_plates
] as const;

/** Site columns that are MIxS slots. */
const SITE_SLOT_COLUMNS = [
	'lat_lon', 'geo_loc_name', 'env_broad_scale', 'env_local_scale'
] as const;

/** Sample numeric columns — parsed as Number on import. */
const NUMERIC_COLUMNS = new Set([
	'temp', 'salinity', 'ph', 'diss_oxygen', 'pressure', 'turbidity', 'chlorophyll',
	'nitrate', 'phosphate', 'samp_vol_we_dna_ext', 'samp_store_temp',
	'latitude', 'longitude'
]);

function escTsv(val: unknown): string {
	if (val == null || val === '') return 'not collected';
	const s = String(val);
	if (s.includes('\t') || s.includes('\n') || s.includes('"')) {
		return '"' + s.replace(/"/g, '""') + '"';
	}
	return s;
}

/** Slots where values live on the sites table, joined in at export time. */
const SITE_SLOT_SET = new Set<string>(SITE_SLOT_COLUMNS);

/**
 * Export samples to a MIxS TSV. When both checklist and extension are given,
 * column selection + order come from the materialized combination class's
 * `required` then `properties` arrays, with `*` prefixing MIxS-required slots
 * per GSC template convention. When only a checklist is given, we use that
 * checklist mixin's slots. When neither, we fall back to SampleTown's full
 * MIxS slot column set for generic dumps.
 */
export function exportMixsTsv(options: {
	labId: string;
	projectId?: string;
	checklist?: string;
	extension?: string;
}): string {
	const db = getDb();
	const siteSelect = SITE_SLOT_COLUMNS.map((c) => `st.${c} AS site_${c}`).join(', ');
	// project_name comes from the joined projects table (no duplicate column
	// on samples). nucl_acid_ext / nucl_acid_amp come from the most recent
	// extract + pcr_plate via correlated subqueries so the emitted TSV carries
	// canonical values even though they live on downstream tables.
	// Lab-scope gate: filter by s.lab_id — the downstream extract / pcr_plate
	// subqueries inherit scope through the sample_id join so no additional
	// lab_id filter is needed there (an extract can only belong to a sample
	// that belongs to this lab).
	let query = `SELECT s.*, ${siteSelect},
		p.project_name AS proj_project_name,
		(SELECT e.nucl_acid_ext FROM extracts e
		  WHERE e.sample_id = s.id AND e.is_deleted = 0 AND e.nucl_acid_ext IS NOT NULL
		  ORDER BY e.created_at DESC LIMIT 1) AS sample_nucl_acid_ext,
		(SELECT e.samp_taxon_id FROM extracts e
		  WHERE e.sample_id = s.id AND e.is_deleted = 0 AND e.samp_taxon_id IS NOT NULL
		  ORDER BY e.created_at DESC LIMIT 1) AS sample_samp_taxon_id,
		(SELECT e.samp_vol_we_dna_ext FROM extracts e
		  WHERE e.sample_id = s.id AND e.is_deleted = 0 AND e.samp_vol_we_dna_ext IS NOT NULL
		  ORDER BY e.created_at DESC LIMIT 1) AS sample_samp_vol_we_dna_ext,
		(SELECT e.pool_dna_extracts FROM extracts e
		  WHERE e.sample_id = s.id AND e.is_deleted = 0 AND e.pool_dna_extracts IS NOT NULL
		  ORDER BY e.created_at DESC LIMIT 1) AS sample_pool_dna_extracts,
		(SELECT pp.nucl_acid_amp FROM pcr_plates pp
		  JOIN pcr_amplifications pa ON pa.plate_id = pp.id
		  JOIN extracts e ON e.id = pa.extract_id
		  WHERE e.sample_id = s.id AND pp.is_deleted = 0 AND pp.nucl_acid_amp IS NOT NULL
		  ORDER BY pp.created_at DESC LIMIT 1) AS sample_nucl_acid_amp
		FROM samples s
		JOIN sites st ON st.id = s.site_id
		JOIN projects p ON p.id = s.project_id
		WHERE s.is_deleted = 0 AND s.lab_id = ?`;
	const params: string[] = [options.labId];
	if (options.projectId) { query += ' AND s.project_id = ?'; params.push(options.projectId); }
	if (options.checklist) { query += ' AND s.mixs_checklist = ?'; params.push(options.checklist); }
	query += ' ORDER BY s.samp_name';
	const rows = db.prepare(query).all(...params) as Record<string, unknown>[];

	// Pre-load sample_values for every sample in one query, keyed by sample_id.
	// Using a single query instead of one-per-slot subquery keeps the export
	// cheap even when a class emits 100+ columns.
	const sampleIds = rows.map((r) => r.id as string);
	const valuesBySample: Record<string, Record<string, string>> = {};
	if (sampleIds.length > 0) {
		const placeholders = sampleIds.map(() => '?').join(',');
		const valRows = db
			.prepare(`SELECT sample_id, slot, value FROM sample_values WHERE sample_id IN (${placeholders})`)
			.all(...sampleIds) as { sample_id: string; slot: string; value: string | null }[];
		for (const r of valRows) {
			if (r.value == null) continue;
			(valuesBySample[r.sample_id] ??= {})[r.slot] = r.value;
		}
	}

	const columns = chooseExportColumns(options.checklist, options.extension);
	const headers = columns.map((c) => c.header);
	const lines = rows.map((row) => {
		const values = valuesBySample[row.id as string] ?? {};
		return columns
			.map((c) => {
				if (c.source === '__project_name__') return escTsv(row.proj_project_name);
				if (c.source === '__nucl_acid_ext__') return escTsv(row.sample_nucl_acid_ext);
				if (c.source === '__nucl_acid_amp__') return escTsv(row.sample_nucl_acid_amp);
				if (c.source === '__samp_taxon_id__') return escTsv(row.sample_samp_taxon_id);
				if (c.source === '__samp_vol_we_dna_ext__') return escTsv(row.sample_samp_vol_we_dna_ext);
				if (c.source === '__pool_dna_extracts__') return escTsv(row.sample_pool_dna_extracts);
				// Sample_values EAV — any slot the samples table doesn't have a
				// column for is looked up here by slot name.
				const eavValue = values[c.source];
				if (eavValue != null) return escTsv(eavValue);
				return escTsv(row[c.source]);
			})
			.join('\t');
	});
	return [headers.join('\t'), ...lines].join('\n');
}

/** Column selection logic extracted so import UI can preview the column list. */
export function chooseExportColumns(
	checklist?: string,
	extension?: string
): { header: string; source: string; required: boolean }[] {
	// Prefer the combination class when available.
	let cls = checklist && extension ? getCombinationClass(checklist, extension) : undefined;
	if (!cls && checklist) cls = getClass(checklist);

	const baseColumns: { header: string; source: string; required: boolean }[] = [];

	if (cls) {
		const required = new Set(cls.required ?? []);
		// required first (in declared order), then the rest of properties
		const ordered: string[] = [
			...(cls.required ?? []),
			...(cls.properties ?? []).filter((p) => !required.has(p))
		];
		for (const slot of ordered) {
			const isRequired = required.has(slot);
			// project_name / nucl_acid_ext / nucl_acid_amp live off-table; route to
			// their subquery alias so export still emits them per MIxS template.
			let source: string;
			if (slot === 'project_name') source = '__project_name__';
			else if (slot === 'nucl_acid_ext') source = '__nucl_acid_ext__';
			else if (slot === 'nucl_acid_amp') source = '__nucl_acid_amp__';
			else if (slot === 'samp_taxon_id') source = '__samp_taxon_id__';
			else if (slot === 'samp_vol_we_dna_ext') source = '__samp_vol_we_dna_ext__';
			else if (slot === 'pool_dna_extracts') source = '__pool_dna_extracts__';
			else if (SITE_SLOT_SET.has(slot)) source = `site_${slot}`;
			else source = slot;
			baseColumns.push({
				header: (isRequired ? '*' : '') + slot,
				source,
				required: isRequired
			});
		}
		// Ensure samp_name is always first (MIxS convention — it's the row identifier)
		const nameIdx = baseColumns.findIndex((c) => c.source === 'samp_name');
		if (nameIdx > 0) {
			const [nameCol] = baseColumns.splice(nameIdx, 1);
			baseColumns.unshift(nameCol);
		}
		// project_name: some checklists don't list it in properties but the GSC
		// templates always include it. Append as optional if not already there.
		if (!baseColumns.some((c) => c.source === 'project_name' || c.source === 'site_project_name')) {
			baseColumns.push({ header: 'project_name', source: '__project_name__', required: false });
		}
		// SampleTown metadata that aren't MIxS slots per se but carry across imports.
		baseColumns.push(
			{ header: 'mixs_checklist', source: 'mixs_checklist', required: false },
			{ header: 'extension', source: 'extension', required: false }
		);
		return baseColumns;
	}

	// Fallback — no class info, emit SampleTown's full known slot set.
	const legacy: { header: string; source: string; required: boolean }[] = [
		{ header: '*samp_name', source: 'samp_name', required: true },
		{ header: '*collection_date', source: 'collection_date', required: true },
		{ header: '*env_medium', source: 'env_medium', required: true },
		{ header: '*lat_lon', source: 'site_lat_lon', required: true },
		{ header: '*geo_loc_name', source: 'site_geo_loc_name', required: true },
		{ header: '*env_broad_scale', source: 'site_env_broad_scale', required: true },
		{ header: '*env_local_scale', source: 'site_env_local_scale', required: true },
		{ header: 'project_name', source: '__project_name__', required: false },
		{ header: 'mixs_checklist', source: 'mixs_checklist', required: false },
		{ header: 'extension', source: 'extension', required: false }
	];
	for (const slot of SAMPLE_SLOT_COLUMNS) {
		if (['samp_name', 'collection_date', 'env_medium', 'project_name'].includes(slot)) continue;
		const isMandatory = getSlot(slot)?.required ?? false;
		legacy.push({ header: (isMandatory ? '*' : '') + slot, source: slot, required: isMandatory });
	}
	return legacy;
}

/** Parse xlsx file buffer into TSV string. */
export function xlsxToTsv(buffer: Buffer): string {
	const wb = XLSX.read(buffer, { type: 'buffer' });
	const ws = wb.Sheets[wb.SheetNames[0]];
	const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
	return rows.map((row: unknown[]) => row.map((cell) => cell ?? '').join('\t')).join('\n');
}

/**
 * Build the header→field map used by the column-mapper UI. Every MIxS slot
 * resolves to SOMETHING — either a named column (if SampleTown has one) or
 * the plain slot name, which the server routes into custom_fields JSON at
 * insert/update time. The `misc_param:` prefix is reserved for headers that
 * don't match any MIxS slot at all (truly custom tags); those stay on the
 * sample so nothing's lost.
 */
export function buildHeaderToFieldMap(): Record<string, string> {
	const map: Record<string, string> = {};

	// Known SampleTown sample + site columns: direct mapping.
	for (const col of SAMPLE_SLOT_COLUMNS) map[col.toLowerCase()] = col;
	for (const col of SITE_SLOT_COLUMNS) map[col.toLowerCase()] = col;

	// Every other MIxS slot → its canonical slot name (no prefix). The samples
	// API splits unknown keys into custom_fields server-side. Covers hundreds
	// of env/chemical measurements (alkalinity, ammonium, silicate, size_frac_*…)
	// plus extract/pcr/library/run slots that we don't have columns for.
	for (const slotName of allSlotNames()) {
		const lower = slotName.toLowerCase();
		if (!map[lower]) map[lower] = slotName;
		// Aliases point at the same target the canonical slot resolves to.
		const slot = getSlot(slotName);
		for (const alias of slot?.aliases ?? []) {
			const k = alias.toLowerCase();
			if (!map[k]) map[k] = map[lower];
		}
	}

	// SRA / BioSample column name translation (canonical list in sra-mapping.ts).
	for (const [sraCol, mixsSlot] of Object.entries(SRA_TO_MIXS)) {
		// sraToMixs target may be a SampleTown column (known), a SampleTown-local
		// field (collector_name / site_name / notes), or any MIxS slot — we
		// trust the mapping and use it directly.
		map[sraCol.toLowerCase()] = mixsSlot;
	}

	// SampleTown-local aliases not covered by the SRA mapping.
	const local: Record<string, string> = {
		site_name: 'site_name',
		station: 'site_code',  // raw station codes (CHDR, WRLB) go to site_code, not site_name
		station_name: 'site_name',
		station_code: 'site_code',
		site_code: 'site_code',
		site_slug: 'site_code',
		code: 'site_code',
		latitude: 'latitude',
		longitude: 'longitude',
		notes: 'notes',        // plain `notes` header → sample.notes (was unmapped before)
		description: 'notes',
		// Project auto-create (lookup key; other project metadata is edited post-import)
		project_name: 'project_name',
		// Extract auto-create columns
		extract_name: 'extract_name',
		extraction_date: 'extraction_date',
		concentration_ng_ul: 'concentration_ng_ul',
		storage_box: 'storage_box',
		storage_location: 'storage_location',
		extract_notes: 'extract_notes',
		// Library auto-create columns
		library_name: 'library_name',
		library_barcode: 'library_barcode',
		library_prep_kit: 'library_prep_kit',
		library_prep_date: 'library_prep_date',
		library_platform: 'library_platform',
		library_instrument_model: 'library_instrument_model',
		library_concentration_ng_ul: 'library_concentration_ng_ul',
		library_notes: 'library_notes',
		// Run auto-create columns (deduped by run_name across the batch)
		run_name: 'run_name',
		run_date: 'run_date',
		run_platform: 'run_platform',
		run_instrument_model: 'run_instrument_model',
		run_flow_cell_id: 'run_flow_cell_id',
		run_directory: 'run_directory',
		run_total_bases_gb: 'run_total_bases_gb',
		run_fastq_dir: 'run_fastq_dir',
		run_read_count: 'run_read_count'
	};
	for (const [k, v] of Object.entries(local)) map[k] = v;

	return map;
}

/**
 * Every valid column-mapper target. Each entry is
 *   { value: <form/column key>, table: <owning table>, title?: <slot title> }
 * Used by the mapper UI as the autocomplete universe. Covers:
 *   - Every MIxS slot (~786), with its owning SampleTown table
 *   - SampleTown-local sample/site fields (site_name, notes, collector_name)
 *   - SampleTown routing columns (mixs_checklist, extension)
 */
export function getImportableFields(): { value: string; table: string; title?: string }[] {
	const out: { value: string; table: string; title?: string }[] = [];
	const seen = new Set<string>();

	const push = (value: string, table: string, title?: string) => {
		if (seen.has(value)) return;
		seen.add(value);
		out.push(title ? { value, table, title } : { value, table });
	};

	// SampleTown-local fields without a MIxS slot.
	push('site_name', 'site');
	push('site_code', 'site');
	push('latitude', 'site');
	push('longitude', 'site');
	push('notes', 'sample');
	push('collector_name', 'sample');
	push('mixs_checklist', 'sample');
	push('extension', 'sample');
	// Project lookup (auto-create if no match)
	push('project_name', 'project');
	// Extract auto-create columns — if any are filled, an extract record is
	// created alongside the sample in the same transaction.
	push('extract_name', 'extract');
	push('extraction_date', 'extract');
	push('concentration_ng_ul', 'extract');
	push('storage_box', 'extract');
	push('storage_location', 'extract');
	push('extract_notes', 'extract');
	// Library auto-create columns
	push('library_name', 'library');
	push('library_barcode', 'library');
	push('library_prep_kit', 'library');
	push('library_prep_date', 'library');
	push('library_platform', 'library');
	push('library_instrument_model', 'library');
	push('library_concentration_ng_ul', 'library');
	push('library_notes', 'library');
	// Run auto-create columns (deduped by run_name across the batch)
	push('run_name', 'run');
	push('run_date', 'run');
	push('run_platform', 'run');
	push('run_instrument_model', 'run');
	push('run_flow_cell_id', 'run');
	push('run_directory', 'run');
	push('run_total_bases_gb', 'run');
	push('run_fastq_dir', 'run');
	push('run_read_count', 'run');

	// Every MIxS slot, mapped to its owning table via slot-ownership.
	// Imports against keys not in SAMPLE_CORE_KEYS get routed to sample_values.
	for (const slotName of allSlotNames()) {
		const table = slotTable(slotName);
		const title = getSlot(slotName)?.title;
		push(slotName, tableName(table), title);
	}

	return out.sort((a, b) => a.value.localeCompare(b.value));
}

function tableName(t: string): string {
	// Display as lowercase singular for consistency with the UI labels.
	if (t === 'samples') return 'sample';
	if (t === 'sites') return 'site';
	if (t === 'projects') return 'project';
	if (t === 'extracts') return 'extract';
	if (t === 'pcr_plates') return 'pcr';
	if (t === 'library_preps') return 'library';
	if (t === 'sequencing_runs') return 'run';
	if (t === 'analyses') return 'analyses (not yet supported)';
	return t;
}

/** Parse a MIxS TSV into per-row sample objects ready for insertion.
 *  `overrideMap` lets the column-mapper UI force specific header→field mappings. */
export function parseMixsTsv(
	tsv: string,
	overrideMap?: Record<string, string>
): {
	samples: Record<string, unknown>[];
	errors: string[];
	headers: string[];
	column_map: Record<string, string>;
} {
	// Strip leading UTF-8 BOM (﻿) — Excel-for-Mac friendly TSVs include it
	// so the app auto-detects UTF-8; without this strip the first header cell
	// would silently gain an invisible prefix and no headers would match.
	const normalized = tsv.replace(/^﻿/, '');
	const rawLines = normalized.trim().split('\n');
	const dataLines = rawLines.filter((l) => !l.startsWith('#'));
	if (dataLines.length < 2) {
		return { samples: [], errors: ['File must have a header row and at least one data row'], headers: [], column_map: {} };
	}

	const headers = dataLines[0].split('\t').map((h) => h.trim().replace(/^\*/, '').toLowerCase());
	const errors: string[] = [];
	const samples: Record<string, unknown>[] = [];
	const autoMap = buildHeaderToFieldMap();

	const column_map: Record<string, string> = {};
	const colMap: { index: number; field: string }[] = [];
	const unmapped: string[] = [];
	headers.forEach((h, i) => {
		const override = overrideMap?.[h];
		let field = override !== undefined ? override : autoMap[h];
		// `misc_param:<tag>` headers in the TSV are user-defined custom tags —
		// pass them through verbatim when no explicit map exists so CLI/
		// programmatic uploads (without the column-mapper UI) don't lose them.
		if (!field && h.startsWith(MISC_PARAM_PREFIX)) {
			const name = sanitizeMiscParamName(h.slice(MISC_PARAM_PREFIX.length));
			if (name) field = `${MISC_PARAM_PREFIX}${name}`;
		}
		if (field && field !== '_skip_') {
			colMap.push({ index: i, field });
			column_map[h] = field;
		} else if (field === '_skip_') {
			column_map[h] = '_skip_';
		} else {
			unmapped.push(h);
			column_map[h] = '';
		}
	});

	if (unmapped.length > 0) {
		errors.push(`Unmapped columns (ignored): ${unmapped.join(', ')}`);
	}

	for (let i = 1; i < dataLines.length; i++) {
		const line = dataLines[i].trim();
		if (!line) continue;

		const values = parseTsvLine(line);
		const sample: Record<string, unknown> = {};
		const customFields: Record<string, unknown> = {};

		for (const { index, field } of colMap) {
			let val: unknown = values[index]?.trim() ?? null;
			// Null sentinels we recognize on import: blank cells, the MIxS
			// placeholder phrases, R's "NA" and variants, pandas' "N/A", the
			// INSDC lone period, and a handful of common synonyms. Matches
			// case-insensitively so "na" / "Na" / "NULL" all map to null.
			if (typeof val === 'string') {
				const lower = val.toLowerCase();
				if (
					val === '' ||
					val === '.' ||
					lower === 'na' ||
					lower === 'n/a' ||
					lower === 'null' ||
					lower === 'none' ||
					lower === 'nan' ||
					lower === 'not collected' ||
					lower === 'not applicable' ||
					lower === 'missing' ||
					lower === 'not provided'
				) {
					val = null;
				}
			}
			if (val == null) continue;
			// `misc_param:<key>` — truly off-schema tag from the column mapper
			// UI or a prior SampleTown export. Sanitize the suffix to [a-z_]
			// and store under the same prefixed key in custom_fields.
			if (field.startsWith(MISC_PARAM_PREFIX)) {
				const name = sanitizeMiscParamName(field.slice(MISC_PARAM_PREFIX.length));
				if (name) customFields[`${MISC_PARAM_PREFIX}${name}`] = val;
				continue;
			}
			// Project lookup field — resolved to project_id in the import endpoint
			// (either matches an existing project in the lab or queues a new one).
			if (PROJECT_FIELDS.has(field)) {
				sample[field] = val;
				continue;
			}
			// Extract-side field — stashed into sample._extract for the endpoint
			// to create an extract row after its sample in the same transaction.
			if (EXTRACT_FIELDS.has(field)) {
				let ev: unknown = val;
				if (field === 'concentration_ng_ul') {
					const n = Number(val);
					ev = isNaN(n) ? null : n;
				}
				if (ev != null && ev !== '') {
					const ex = (sample._extract as Record<string, unknown>) ?? {};
					ex[field] = ev;
					sample._extract = ex;
				}
				continue;
			}
			// Library-side field — endpoint creates a library_preps row linked
			// to this sample's extract.
			if (LIBRARY_FIELDS.has(field)) {
				let lv: unknown = val;
				if (field === 'library_concentration_ng_ul') {
					const n = Number(val);
					lv = isNaN(n) ? null : n;
				}
				if (lv != null && lv !== '') {
					const lib = (sample._library as Record<string, unknown>) ?? {};
					lib[field] = lv;
					sample._library = lib;
				}
				continue;
			}
			// Run-side field — endpoint dedupes runs by run_name across the
			// batch and creates run_libraries links per row.
			if (RUN_FIELDS.has(field)) {
				let rv: unknown = val;
				if (field === 'run_total_bases_gb' || field === 'run_read_count') {
					const n = Number(val);
					rv = isNaN(n) ? null : n;
				}
				if (rv != null && rv !== '') {
					const run = (sample._run as Record<string, unknown>) ?? {};
					run[field] = rv;
					sample._run = run;
				}
				continue;
			}
			// Real sample/site column → route to the sample row; the samples
			// POST/PUT will bind it to a named column.
			if ((SAMPLE_SLOT_COLUMNS as readonly string[]).includes(field) ||
			    field === 'samp_name' || field === 'collection_date' || field === 'env_medium' ||
			    SITE_FIELDS.has(field) || field === 'notes' || field === 'mixs_checklist' ||
			    field === 'extension' || field === 'collector_name' || field === 'latitude' ||
			    field === 'longitude' || field === 'site_name') {
				sample[field] = val;
				continue;
			}
			// Everything else is a recognized MIxS slot that SampleTown doesn't
			// have a column for — store in custom_fields keyed by the slot name
			// (no prefix) so the sample form's organizeForm re-surfaces it as a
			// normal MIxS-slot input with glossary popover.
			customFields[field] = val;
		}

		// Spill fields (non-column MIxS slots + misc_param:<tag> user tags) go
		// into the sample_values EAV table — the import endpoint picks them up
		// via the _values key. Keeping them as a Record here, not a JSON blob.
		if (Object.keys(customFields).length > 0) {
			sample._values = customFields;
		}

		if (!sample.samp_name) {
			errors.push(`Row ${i + 1}: missing samp_name`);
			continue;
		}

		// Sanitize identifier-style names: samp_name and site_code become URL/
		// filesystem-safe. site_name is a display field, so we only strip
		// control chars (tabs/newlines would break the TSV round-trip) but
		// leave spaces, punctuation, and unicode letters intact.
		const STRICT_NAME_RE = /[^a-zA-Z0-9_.\-]/g;
		const DISPLAY_NAME_RE = /[\x00-\x1f]/g;
		for (const nameField of ['samp_name', 'site_code']) {
			const raw = sample[nameField] as string | null;
			if (raw && STRICT_NAME_RE.test(raw)) {
				const cleaned = raw.replace(STRICT_NAME_RE, '.');
				errors.push(`Row ${i + 1}: ${nameField} "${raw}" contains invalid characters, sanitized to "${cleaned}"`);
				sample[nameField] = cleaned;
			}
		}
		{
			const raw = sample.site_name as string | null;
			if (raw && DISPLAY_NAME_RE.test(raw)) {
				const cleaned = raw.replace(DISPLAY_NAME_RE, '').trim();
				errors.push(`Row ${i + 1}: site_name had control characters, stripped`);
				sample.site_name = cleaned;
			}
		}

		if (!sample.collection_date) {
			errors.push(`Row ${i + 1} (${sample.samp_name}): missing collection_date`);
		}

		// Compose lat_lon from separate lat/lng if not provided directly.
		if (!sample.lat_lon && sample.latitude && sample.longitude) {
			const lat = Number(sample.latitude);
			const lng = Number(sample.longitude);
			if (!isNaN(lat) && !isNaN(lng)) {
				const ns = lat >= 0 ? 'N' : 'S';
				const ew = lng >= 0 ? 'E' : 'W';
				sample.lat_lon = `${Math.abs(lat).toFixed(4)} ${ns} ${Math.abs(lng).toFixed(4)} ${ew}`;
			}
		}

		if (!sample.mixs_checklist) sample.mixs_checklist = 'MimarksS';

		for (const numField of NUMERIC_COLUMNS) {
			if (sample[numField] != null) {
				const n = Number(sample[numField]);
				sample[numField] = isNaN(n) ? null : n;
			}
		}

		samples.push(sample);
	}

	return { samples, errors, headers, column_map };
}

function parseTsvLine(line: string): string[] {
	const result: string[] = [];
	let i = 0;
	while (i <= line.length) {
		if (i >= line.length) { result.push(''); break; }
		if (line[i] === '"') {
			let val = '';
			i++;
			while (i < line.length) {
				if (line[i] === '"' && line[i + 1] === '"') { val += '"'; i += 2; }
				else if (line[i] === '"') { i++; break; }
				else { val += line[i]; i++; }
			}
			if (i < line.length && line[i] === '\t') i++;
			result.push(val);
		} else {
			const tab = line.indexOf('\t', i);
			if (tab === -1) { result.push(line.slice(i)); break; }
			result.push(line.slice(i, tab));
			i = tab + 1;
		}
	}
	return result;
}
