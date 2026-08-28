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
import { parseTsvLine } from '$lib/mixs/tsv';
import {
	columnVocabulary,
	isVocabularyRow,
	COLUMN_VOCABULARIES,
	type ColumnVocabulary
} from '$lib/mixs/vocabulary';
import { sanitizeMiscParamName, MISC_PARAM_PREFIX } from '$lib/mixs/sample-form';
import * as XLSX from 'xlsx';
import type { Permit } from '$lib/types';

/** Default license advertised in the MIxS misc_param attribution block. */
const DEFAULT_LICENSE = 'CC-BY-4.0 with CARE notice';

/** Fields that live on the sites table, not the samples table. */
export const SITE_FIELDS = new Set([
	'site_name', 'site_code', 'lat_lon', 'latitude', 'longitude', 'geo_loc_name',
	'env_broad_scale', 'env_local_scale'
]);

/** Fields that select/create the project a sample belongs to. Resolved to
 *  project_id in the import endpoint. Kept to the bare minimum: the lookup key.
 *  Other project metadata (pi_name, institution, funding) is filled in through
 *  the normal project edit UI after import. */
export const PROJECT_FIELDS = new Set(['project_name', 'project_accession']);

/** Fields that get split off into an extracts row when present. Mirrors the
 *  site auto-create pattern: if any of these are filled for a given sample,
 *  an extract record is created after the sample insert in the same txn. */
export const EXTRACT_FIELDS = new Set([
	'extract_name', 'extraction_date', 'concentration_ng_ul',
	'storage_box', 'storage_location', 'extract_notes', 'extract_accession',
	// MIxS nucl_acid_ext is owned by extracts (see slot-ownership.ts) and has
	// a column there, so it lands on the extract rather than spilling into
	// sample_values.
	'nucl_acid_ext'
]);

/** Fields that get split off into a pcr_amplifications row when present.
 *  pcr_amplifications.extract_id is NOT NULL, so a row carrying PCR columns
 *  without extract columns still gets an extract — a PCR product has to have
 *  been amplified from something. The MIxS slots here (pcr_cond, target_gene,
 *  target_subfragment, nucl_acid_amp) are owned by pcr_plates per
 *  slot-ownership.ts; target_gene lives on the primer set, so it is carried
 *  in the reaction's custom_fields until one is linked. */
export const PCR_FIELDS = new Set([
	'pcr_name', 'pcr_accession', 'pcr_plate_name', 'pcr_date', 'pcr_cond', 'nucl_acid_amp',
	'target_gene', 'target_subfragment',
	'forward_primer_name', 'forward_primer_seq',
	'reverse_primer_name', 'reverse_primer_seq',
	'annealing_temp_c', 'num_cycles', 'pcr_notes'
]);

/** Fields that get split off into a library_preps row when present. The
 *  importer creates one library per row (linked to the row's just-created
 *  extract). When run_* fields are also present, a run_libraries link is
 *  added connecting the library to the resolved run. */
export const LIBRARY_FIELDS = new Set([
	'library_name', 'library_barcode', 'library_prep_kit', 'library_prep_date',
	'library_platform', 'library_instrument_model', 'library_concentration_ng_ul',
	'library_notes',
	// SRA library descriptors — real columns on library_preps, so an archive
	// import round-trips them instead of losing the submission's own terms.
	'library_source', 'library_selection', 'library_type', 'library_fragment_size_bp',
	// Plate the prep is laid out on. Created or reused by name, lab-scoped, so
	// several imports can fill one plate.
	'library_plate_name', 'library_accession'
]);

/** Fields that get split off into a sequencing_runs row when present.
 *
 *  A run is a flow cell. Runs are deduped within a batch by run_name, so the
 *  many libraries sequenced on one cell share a single run record, and the
 *  link table run_libraries carries what differs between them: that library's
 *  read files, their checksums, its read count, and the archive's own run
 *  accession for it. */
export const RUN_FIELDS = new Set([
	'run_name', 'run_date', 'run_platform', 'run_instrument_model',
	'run_flow_cell_id', 'run_directory', 'run_fastq_dir', 'run_total_bases_gb',
	'run_submission_accession',
	// Per-(run, library) link fields — written to run_libraries, not
	// sequencing_runs. Side-car bag is shared with the run for parsing.
	'run_read_count', 'run_accession_id',
	'run_fastq_r1', 'run_fastq_r1_md5', 'run_fastq_r2', 'run_fastq_r2_md5',
	'run_fastq_single', 'run_fastq_single_md5', 'run_fastq_bytes'
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

export { columnVocabulary, COLUMN_VOCABULARIES, type ColumnVocabulary };

export interface ExportColumn {
	header: string;
	source: string;
	required: boolean;
	/** Which standard the column answers to. Decided where the column is built,
	 *  since the name alone cannot always tell. */
	vocabulary: ColumnVocabulary;
}

/** Columns parsed as dates on import. */
const DATE_COLUMNS = new Set([
	'collection_date', 'extraction_date', 'library_prep_date', 'run_date', 'pcr_date'
]);

/**
 * Accept the compact spelling of a date. MIxS wants ISO-8601, but sheets
 * exported from instruments and lab notebooks routinely carry `20180423`,
 * which fails the slot's pattern and imports as an unusable string.
 *
 * Only the unambiguous 8-digit form is converted. `03/04/2018` is left alone —
 * day-first and month-first are both common and indistinguishable, and
 * guessing would move samples in time without telling anyone.
 */
export function normalizeDate(value: string): string {
	const m = /^(\d{4})(\d{2})(\d{2})$/.exec(value.trim());
	if (!m) return value;
	const [, year, month, day] = m;
	const mo = Number(month);
	const d = Number(day);
	if (mo < 1 || mo > 12 || d < 1 || d > 31) return value;
	return `${year}-${month}-${day}`;
}

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
	// Site columns joined onto each sample row. Beyond the MIxS slots, the mask
	// below needs the raw coordinates and the sensitivity flag; without the
	// coordinates it has nothing to coarsen and silently exports the precise
	// value.
	const siteSelect =
		SITE_SLOT_COLUMNS.map((c) => `st.${c} AS site_${c}`).join(', ') +
		', st.latitude AS site_latitude, st.longitude AS site_longitude' +
		', st.is_location_sensitive AS site_is_location_sensitive';
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
		p.accession AS proj_accession,
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

	// Attribution block. For every sample we compute covering permits + license
	// string + IRCC numbers and merge into the sample's misc_param slot at
	// export time. The plan calls this the "core CARE-compliance win" —
	// governance metadata rides along when data leaves us for SRA/GenBank.
	const attributionBySample = buildAttributionMap(db, options.labId, rows);

	// Columns grouped by vocabulary, alphabetical within each group, with
	// samp_name pulled to the front — it identifies the row, and burying it
	// inside the MIxS block would make the sheet hard to read.
	const columns = sortColumnsByVocabulary(
		chooseExportColumns(options.checklist, options.extension)
	);
	const headers = columns.map((c) => c.header);
	// Second header row: each column's vocabulary. The importer strips it.
	const vocabularies = columns.map((c) => c.vocabulary);
	const lines = rows.map((row) => {
		const values = valuesBySample[row.id as string] ?? {};
		// Per-row sensitive-location masking. When the sample flag is set, the
		// geographic slot values — lat_lon, latitude, longitude — are coarsened
		// to 0.1° (~10km). This happens before any column is emitted so EAV,
		// site-join, and row-column paths all pick up the masked values.
		const masked = maskSensitiveLocation(row);
		// Merge attribution into misc_param. Preserves any user-set misc_param
		// entries (semicolon-joined).
		const attribution = attributionBySample.get(row.id as string);
		if (attribution) {
			const existing = values.misc_param ?? '';
			values.misc_param = existing ? `${existing}; ${attribution}` : attribution;
		}
		return columns
			.map((c) => {
				if (c.source === '__project_name__') return escTsv(row.proj_project_name);
				if (c.source === '__project_accession__') return escTsv(row.proj_accession);
				if (c.source === '__nucl_acid_ext__') return escTsv(row.sample_nucl_acid_ext);
				if (c.source === '__nucl_acid_amp__') return escTsv(row.sample_nucl_acid_amp);
				if (c.source === '__samp_taxon_id__') return escTsv(row.sample_samp_taxon_id);
				if (c.source === '__samp_vol_we_dna_ext__') return escTsv(row.sample_samp_vol_we_dna_ext);
				if (c.source === '__pool_dna_extracts__') return escTsv(row.sample_pool_dna_extracts);
				// Sample_values EAV — any slot the samples table doesn't have a
				// column for is looked up here by slot name.
				const eavValue = values[c.source];
				if (eavValue != null) return escTsv(eavValue);
				return escTsv(masked[c.source] ?? row[c.source]);
			})
			.join('\t');
	});
	return [headers.join('\t'), vocabularies.join('\t'), ...lines].join('\n');
}

/**
 * For every sample in `rows`, compute the MIxS `misc_param`-style attribution
 * string to concatenate at export time. Covers the plan's "attribution
 * carry-through" item:
 *   - license:<string>              (always, defaults to CC-BY-4.0 with CARE)
 *   - permit_id:<identifier>        (per covering permit, if it has one)
 *   - ircc:<identifier>             (per covering IRCC permit)
 * Indigenous-involvement fields from the project-level sovereignty work (item
 * 2 in the governance plan) are wired in later; they land in this map under
 * the same mechanism.
 *
 * Coverage follows the same rule as permit-coverage.ts (lab + project link +
 * scope site/date). Collected in one batched query so the cost is O(samples)
 * on export, not O(samples × permits).
 */
function buildAttributionMap(
	db: ReturnType<typeof getDb>,
	labId: string,
	rows: Record<string, unknown>[]
): Map<string, string> {
	const out = new Map<string, string>();
	if (rows.length === 0) return out;

	const sampleIds = rows.map((r) => r.id as string);
	const placeholders = sampleIds.map(() => '?').join(',');
	const coverage = db
		.prepare(
			`
      SELECT DISTINCT s.id AS sample_id, p.id AS permit_id, p.permit_type, p.identifier
        FROM samples s
        JOIN permit_scopes ps ON ps.site_id = s.site_id
        JOIN permits       p  ON p.id = ps.permit_id AND p.lab_id = s.lab_id
       WHERE s.lab_id = ?
         AND s.id IN (${placeholders})
         AND (ps.valid_from  IS NULL OR ps.valid_from  <= s.collection_date)
         AND (ps.valid_until IS NULL OR ps.valid_until >= s.collection_date)
      `
		)
		.all(labId, ...sampleIds) as Array<Pick<Permit, 'permit_type' | 'identifier'> & { sample_id: string }>;

	const perSample = new Map<string, Array<{ permit_type: string; identifier: string | null }>>();
	for (const c of coverage) {
		const arr = perSample.get(c.sample_id) ?? [];
		arr.push({ permit_type: c.permit_type, identifier: c.identifier });
		perSample.set(c.sample_id, arr);
	}

	for (const row of rows) {
		const sampleId = row.id as string;
		const parts: string[] = [`license:${DEFAULT_LICENSE}`];
		const covers = perSample.get(sampleId) ?? [];
		for (const p of covers) {
			if (!p.identifier) continue;
			if (p.permit_type === 'ircc') parts.push(`ircc:${p.identifier}`);
			else parts.push(`permit_id:${p.identifier}`);
		}
		out.set(sampleId, parts.join('; '));
	}
	return out;
}

/**
 * Return a partial row with lat/lng-derived slots coarsened when the sample's
 * site is marked sensitive. Mirrors GBIF's Sensitive Species Extension
 * pattern: generalize the locality data rather than redacting it, and emit a
 * Darwin Core `dataGeneralizations` note if the downstream format carries it.
 *
 * Coarsening rules:
 *   - latitude/longitude → rounded to 0.1° (~10 km)
 *   - site_lat_lon → rewritten from the coarsened values in MIxS format
 *   - locality + site_name → left alone (string-valued; operator's call)
 */
function maskSensitiveLocation(row: Record<string, unknown>): Record<string, unknown> {
	if (!row.site_is_location_sensitive) return {};
	const lat = row.site_latitude ?? row.latitude;
	const lng = row.site_longitude ?? row.longitude;
	const latN = typeof lat === 'number' ? lat : Number(lat);
	const lngN = typeof lng === 'number' ? lng : Number(lng);
	if (!isFinite(latN) || !isFinite(lngN)) return {};
	const coarsenLat = Math.round(latN * 10) / 10;
	const coarsenLng = Math.round(lngN * 10) / 10;
	const ns = coarsenLat >= 0 ? 'N' : 'S';
	const ew = coarsenLng >= 0 ? 'E' : 'W';
	const latLon = `${Math.abs(coarsenLat).toFixed(1)} ${ns} ${Math.abs(coarsenLng).toFixed(1)} ${ew}`;
	return {
		latitude: coarsenLat,
		longitude: coarsenLng,
		site_latitude: coarsenLat,
		site_longitude: coarsenLng,
		lat_lon: latLon,
		site_lat_lon: latLon
	};
}

/** Column selection logic extracted so import UI can preview the column list. */
/**
 * Group columns by vocabulary, then alphabetically within each group.
 *
 * This deliberately departs from the GSC template order (required slots first,
 * in declared order). A SampleTown export is not a submission template — it is
 * a working sheet that mixes three vocabularies, and grouping them keeps a
 * reader from hunting for which columns belong to which standard.
 */
export function sortColumnsByVocabulary<T extends { header: string; vocabulary: ColumnVocabulary }>(
	columns: T[]
): T[] {
	const rank = (c: T) => COLUMN_VOCABULARIES.indexOf(c.vocabulary);
	const bare = (h: string) => h.replace(/^\*/, '');
	const sorted = [...columns].sort((a, b) => {
		const byVocab = rank(a) - rank(b);
		if (byVocab !== 0) return byVocab;
		return bare(a.header).localeCompare(bare(b.header));
	});
	const nameIdx = sorted.findIndex((c) => bare(c.header) === 'samp_name');
	if (nameIdx > 0) sorted.unshift(...sorted.splice(nameIdx, 1));
	return sorted;
}

export function chooseExportColumns(
	checklist?: string,
	extension?: string
): ExportColumn[] {
	// Prefer the combination class when available.
	let cls = checklist && extension ? getCombinationClass(checklist, extension) : undefined;
	if (!cls && checklist) cls = getClass(checklist);

	const baseColumns: ExportColumn[] = [];

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
				required: isRequired,
				// It came out of the MIxS class, so it answers to MIxS — whether or
				// not the release ships a slot definition for it. A handful of class
				// properties have none.
				vocabulary: 'mixs'
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
			baseColumns.push({
				header: 'project_name',
				source: '__project_name__',
				required: false,
				vocabulary: 'mixs'
			});
		}
		// SampleTown metadata that aren't MIxS slots per se but carry across imports.
		baseColumns.push(
			{ header: 'mixs_checklist', source: 'mixs_checklist', required: false, vocabulary: 'sampletown' },
			{ header: 'extension', source: 'extension', required: false, vocabulary: 'sampletown' }
		);
		// Accessions, so an exported sheet still says where its records came from
		// and re-importing it puts them back.
		baseColumns.push(
			{ header: 'accession', source: 'accession', required: false, vocabulary: 'insdc' },
			{ header: 'project_accession', source: '__project_accession__', required: false, vocabulary: 'insdc' }
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
	// The fallback list is hand-written, so its names are reliable enough to
	// classify from.
	return legacy.map((c) => ({ ...c, vocabulary: columnVocabulary(c.header) }));
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
		notes: 'notes',
		description: 'notes',
		// SRA spells it collected_by (mapped above); a SampleTown export emits
		// the local name, so both have to resolve or a round trip loses it.
		collector_name: 'collector_name',
		// Routing columns: which MIxS combination class the row is validated
		// against. getImportableFields() offers them as targets, so they have to
		// resolve here too or a sheet that declares its own checklist loses it.
		mixs_checklist: 'mixs_checklist',
		extension: 'extension',
		// Project auto-create (lookup key; other project metadata is edited post-import)
		project_name: 'project_name',
		project_accession: 'project_accession',
		// INSDC accession carried onto each record.
		accession: 'accession',
		extract_accession: 'extract_accession',
		pcr_accession: 'pcr_accession',
		library_accession: 'library_accession',
		run_accession_id: 'run_accession_id',
		// Extract auto-create columns
		extract_name: 'extract_name',
		extraction_date: 'extraction_date',
		concentration_ng_ul: 'concentration_ng_ul',
		storage_box: 'storage_box',
		storage_location: 'storage_location',
		extract_notes: 'extract_notes',
		nucl_acid_ext: 'nucl_acid_ext',
		// PCR auto-create columns (one reaction per row, off the row's extract)
		pcr_name: 'pcr_name',
		pcr_plate_name: 'pcr_plate_name',
		pcr_date: 'pcr_date',
		pcr_cond: 'pcr_cond',
		nucl_acid_amp: 'nucl_acid_amp',
		target_gene: 'target_gene',
		target_subfragment: 'target_subfragment',
		forward_primer_name: 'forward_primer_name',
		forward_primer_seq: 'forward_primer_seq',
		reverse_primer_name: 'reverse_primer_name',
		reverse_primer_seq: 'reverse_primer_seq',
		annealing_temp_c: 'annealing_temp_c',
		num_cycles: 'num_cycles',
		pcr_notes: 'pcr_notes',
		// Library auto-create columns
		library_name: 'library_name',
		library_source: 'library_source',
		library_selection: 'library_selection',
		library_type: 'library_type',
		library_fragment_size_bp: 'library_fragment_size_bp',
		library_plate_name: 'library_plate_name',
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
		run_submission_accession: 'run_submission_accession',
		// Per-(run, library) link columns
		run_read_count: 'run_read_count',
		run_fastq_r1: 'run_fastq_r1',
		run_fastq_r1_md5: 'run_fastq_r1_md5',
		run_fastq_r2: 'run_fastq_r2',
		run_fastq_r2_md5: 'run_fastq_r2_md5',
		run_fastq_single: 'run_fastq_single',
		run_fastq_single_md5: 'run_fastq_single_md5',
		run_fastq_bytes: 'run_fastq_bytes'
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
export function getImportableFields(): {
	value: string;
	table: string;
	title?: string;
	/** SampleTown's own column rather than a MIxS slot — the auto-create chain
	 *  (extract, PCR, library, run) and the site/project lookups. Flagged so a
	 *  sheet can offer them: nothing else tells an operator they exist. */
	local?: true;
}[] {
	const out: { value: string; table: string; title?: string; local?: true }[] = [];
	const seen = new Set<string>();

	// Everything pushed before the MIxS slot loop is SampleTown's own.
	let isLocal = true;
	const push = (value: string, table: string, title?: string) => {
		if (seen.has(value)) return;
		seen.add(value);
		out.push({ value, table, ...(title ? { title } : {}), ...(isLocal ? { local: true as const } : {}) });
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
	push('project_accession', 'project');
	push('accession', 'sample');
	push('extract_accession', 'extract');
	push('pcr_accession', 'pcr');
	push('library_accession', 'library');
	push('run_accession_id', 'run');
	// Extract auto-create columns — if any are filled, an extract record is
	// created alongside the sample in the same transaction.
	push('extract_name', 'extract');
	push('extraction_date', 'extract');
	push('concentration_ng_ul', 'extract');
	push('storage_box', 'extract');
	push('storage_location', 'extract');
	push('extract_notes', 'extract');
	push('nucl_acid_ext', 'extract');
	// PCR auto-create columns — one reaction per row, off the row's extract.
	push('pcr_name', 'pcr');
	push('pcr_plate_name', 'pcr');
	push('pcr_date', 'pcr');
	push('pcr_cond', 'pcr');
	push('nucl_acid_amp', 'pcr');
	push('target_gene', 'pcr');
	push('target_subfragment', 'pcr');
	push('forward_primer_name', 'pcr');
	push('forward_primer_seq', 'pcr');
	push('reverse_primer_name', 'pcr');
	push('reverse_primer_seq', 'pcr');
	push('annealing_temp_c', 'pcr');
	push('num_cycles', 'pcr');
	push('pcr_notes', 'pcr');
	// Library auto-create columns
	push('library_name', 'library');
	push('library_source', 'library');
	push('library_selection', 'library');
	push('library_type', 'library');
	push('library_fragment_size_bp', 'library');
	push('library_plate_name', 'library');
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
	push('run_submission_accession', 'run');
	push('run_read_count', 'run');
	push('run_fastq_r1', 'run');
	push('run_fastq_r1_md5', 'run');
	push('run_fastq_r2', 'run');
	push('run_fastq_r2_md5', 'run');
	push('run_fastq_single', 'run');
	push('run_fastq_single_md5', 'run');
	push('run_fastq_bytes', 'run');

	// Every MIxS slot, mapped to its owning table via slot-ownership.
	// Imports against keys not in SAMPLE_CORE_KEYS get routed to sample_values.
	isLocal = false;
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

	// A SampleTown export carries a vocabulary row under the header, saying
	// whether each column is a MIxS slot, an INSDC field, or SampleTown's own.
	// It is metadata about the columns, not a sample, so it is dropped on the
	// way back in. Every populated cell has to be one of the three words for
	// this to fire, which no real row would satisfy.
	if (dataLines.length > 1) {
		if (isVocabularyRow(parseTsvLine(dataLines[1]))) dataLines.splice(1, 1);
	}
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
			if (typeof val === 'string' && DATE_COLUMNS.has(field)) val = normalizeDate(val);
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
			// PCR-side field — endpoint creates a pcr_amplifications row off the
			// row's extract, and links the row's library to it as its source.
			if (PCR_FIELDS.has(field)) {
				let pv: unknown = val;
				if (field === 'annealing_temp_c' || field === 'num_cycles') {
					const n = Number(val);
					pv = isNaN(n) ? null : n;
				}
				if (pv != null && pv !== '') {
					const pcr = (sample._pcr as Record<string, unknown>) ?? {};
					pcr[field] = pv;
					sample._pcr = pcr;
				}
				continue;
			}
			// Library-side field — endpoint creates a library_preps row linked
			// to this sample's extract.
			if (LIBRARY_FIELDS.has(field)) {
				let lv: unknown = val;
				if (field === 'library_concentration_ng_ul' || field === 'library_fragment_size_bp') {
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
				if (
					field === 'run_total_bases_gb' ||
					field === 'run_read_count' ||
					field === 'run_fastq_bytes'
				) {
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
			    field === 'longitude' || field === 'site_name' || field === 'accession') {
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

		// Names are cleaned as far as their role requires and no further.
		//
		// site_code is an identifier: POST /api/sites rejects anything outside
		// [A-Za-z0-9_.-], so an import is held to the same rule rather than
		// admitting codes that could not have been typed in by hand.
		//
		// samp_name and site_name are labels. Nothing addresses a sample by its
		// name — pages route on the row id, photo files are named for the photo
		// — and POST /api/samples accepts any non-empty name, so an import that
		// rewrote them would disagree with the rest of the app and lose the
		// archive's own wording. Only control characters go, since a tab or a
		// newline would break the TSV round trip.
		const CONTROL_RE = /[\x00-\x1f]/;
		const NON_IDENTIFIER_RE = /[^a-zA-Z0-9_.\-]/;
		const rawCode = sample.site_code as string | null;
		if (rawCode && NON_IDENTIFIER_RE.test(rawCode)) {
			const cleaned = rawCode.replace(/[^a-zA-Z0-9_.\-]/g, '.');
			errors.push(
				`Row ${i + 1}: site_code "${rawCode}" contains invalid characters, sanitized to "${cleaned}"`
			);
			sample.site_code = cleaned;
		}
		for (const nameField of ['samp_name', 'site_name']) {
			const raw = sample[nameField] as string | null;
			if (raw && CONTROL_RE.test(raw)) {
				// A space, not nothing: a tab between two words separates them.
				const cleaned = raw.replace(/[\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim();
				errors.push(`Row ${i + 1}: ${nameField} had control characters, stripped`);
				sample[nameField] = cleaned;
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

