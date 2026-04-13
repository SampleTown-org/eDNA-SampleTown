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
import { SRA_TO_MIXS } from '$lib/mixs/sra-mapping';
import * as XLSX from 'xlsx';

/** Fields that live on the sites table, not the samples table. */
export const SITE_FIELDS = new Set([
	'site_name', 'lat_lon', 'latitude', 'longitude', 'geo_loc_name',
	'env_broad_scale', 'env_local_scale'
]);

/** Sample columns that exist as real columns in the samples table and are
 *  MIxS slots. Kept explicit so we don't accidentally expose sync internals. */
const SAMPLE_SLOT_COLUMNS = [
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
	projectId?: string;
	checklist?: string;
	extension?: string;
} = {}): string {
	const db = getDb();
	const siteSelect = SITE_SLOT_COLUMNS.map((c) => `st.${c} AS site_${c}`).join(', ');
	// project_name comes from the joined projects table (no duplicate column
	// on samples). nucl_acid_ext / nucl_acid_amp come from the most recent
	// extract + pcr_plate via correlated subqueries so the emitted TSV carries
	// canonical values even though they live on downstream tables.
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
		WHERE s.is_deleted = 0`;
	const params: string[] = [];
	if (options.projectId) { query += ' AND s.project_id = ?'; params.push(options.projectId); }
	if (options.checklist) { query += ' AND s.mixs_checklist = ?'; params.push(options.checklist); }
	query += ' ORDER BY s.samp_name';
	const rows = db.prepare(query).all(...params) as Record<string, unknown>[];

	const columns = chooseExportColumns(options.checklist, options.extension);
	const headers = columns.map((c) => c.header);
	const lines = rows.map((row) => {
		return columns
			.map((c) => {
				if (c.source === '__project_name__') return escTsv(row.proj_project_name);
				if (c.source === '__nucl_acid_ext__') return escTsv(row.sample_nucl_acid_ext);
				if (c.source === '__nucl_acid_amp__') return escTsv(row.sample_nucl_acid_amp);
				if (c.source === '__samp_taxon_id__') return escTsv(row.sample_samp_taxon_id);
				if (c.source === '__samp_vol_we_dna_ext__') return escTsv(row.sample_samp_vol_we_dna_ext);
				if (c.source === '__pool_dna_extracts__') return escTsv(row.sample_pool_dna_extracts);
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
 * Build the header→field map used by the column-mapper UI. Matches on:
 *   1. Exact MIxS slot name (lowercase)
 *   2. MIxS slot aliases (lowercase) — from the active schema's slot metadata
 *   3. A handful of sample/site column aliases specific to SampleTown
 * Returns '_skip_' for columns we recognize as MIxS-structural but don't store
 * (project_name goes to its own column, custom fields handled separately).
 */
export function buildHeaderToFieldMap(): Record<string, string> {
	const map: Record<string, string> = {};

	// Known SampleTown sample columns
	for (const col of SAMPLE_SLOT_COLUMNS) map[col.toLowerCase()] = col;
	// Known site columns
	for (const col of SITE_SLOT_COLUMNS) map[col.toLowerCase()] = col;

	// MIxS slot aliases from the schema index
	for (const slotName of allSlotNames()) {
		const slot = getSlot(slotName);
		if (!slot?.aliases) continue;
		for (const alias of slot.aliases) {
			const k = alias.toLowerCase();
			if (!map[k] && isKnownColumn(slotName)) map[k] = slotName;
		}
	}

	// SRA / BioSample column name translation (canonical list in sra-mapping.ts).
	for (const [sraCol, mixsSlot] of Object.entries(SRA_TO_MIXS)) {
		if (isKnownColumn(mixsSlot) || mixsSlot === 'collector_name' || mixsSlot === 'site_name' || mixsSlot === 'notes') {
			map[sraCol.toLowerCase()] = mixsSlot;
		}
	}

	// SampleTown-local aliases not covered by the SRA mapping.
	const local: Record<string, string> = {
		site_name: 'site_name',
		station: 'site_name',
		station_name: 'site_name',
		latitude: 'latitude',
		longitude: 'longitude',
		description: 'notes'
	};
	for (const [k, v] of Object.entries(local)) map[k] = v;

	return map;
}

function isKnownColumn(slot: string): boolean {
	return (SAMPLE_SLOT_COLUMNS as readonly string[]).includes(slot) ||
		(SITE_SLOT_COLUMNS as readonly string[]).includes(slot);
}

/** Fields available as column-mapper targets, labeled with their table. */
export function getImportableFields(): { value: string; label: string }[] {
	const out: { value: string; label: string }[] = [];
	for (const f of SITE_SLOT_COLUMNS) out.push({ value: f, label: `site: ${f}` });
	out.push({ value: 'site_name', label: 'site: site_name' });
	for (const f of SAMPLE_SLOT_COLUMNS) out.push({ value: f, label: `sample: ${f}` });
	out.push({ value: 'mixs_checklist', label: 'sample: mixs_checklist' });
	out.push({ value: 'extension', label: 'sample: extension' });
	out.push({ value: 'notes', label: 'sample: notes' });
	return out.sort((a, b) => a.label.localeCompare(b.label));
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
	const rawLines = tsv.trim().split('\n');
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
		const field = override !== undefined ? override : autoMap[h];
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
			if (val === '' || val === 'not collected' || val === 'not applicable' || val === 'missing') {
				val = null;
			}
			// `misc_param:<key>` — route unknown columns into the custom_fields
			// JSON blob under a MIxS-style misc_param-prefixed key. The sample form
			// reads these back as optional inputs.
			if (field.startsWith('misc_param:')) {
				if (field.length > 'misc_param:'.length) customFields[field] = val;
				continue;
			}
			sample[field] = val;
		}

		if (Object.keys(customFields).length > 0) {
			sample.custom_fields = JSON.stringify(customFields);
		}

		if (!sample.samp_name) {
			errors.push(`Row ${i + 1}: missing samp_name`);
			continue;
		}

		// Sanitize names: only a-zA-Z0-9_-. allowed; replace others with .
		const NAME_RE = /[^a-zA-Z0-9_.\-]/g;
		for (const nameField of ['samp_name', 'site_name']) {
			const raw = sample[nameField] as string | null;
			if (raw && NAME_RE.test(raw)) {
				const cleaned = raw.replace(NAME_RE, '.');
				errors.push(`Row ${i + 1}: ${nameField} "${raw}" contains invalid characters, sanitized to "${cleaned}"`);
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
