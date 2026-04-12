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
import { allSlotNames, getSlot } from '$lib/mixs/schema-index';
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
	'samp_name', 'collection_date', 'env_medium', 'samp_taxon_id', 'project_name',
	// Extension-specific location
	'depth', 'elev',
	// Host-associated
	'host_taxid', 'specific_host',
	// Measurements
	'temp', 'salinity', 'ph', 'diss_oxygen', 'pressure', 'turbidity', 'chlorophyll', 'nitrate', 'phosphate',
	// Sampling
	'samp_collect_device', 'samp_collect_method', 'samp_mat_process', 'samp_size',
	'samp_vol_we_dna_ext', 'size_frac', 'source_mat_id',
	// Storage
	'samp_store_sol', 'samp_store_temp', 'samp_store_dur', 'samp_store_loc',
	// Protocol references
	'nucl_acid_ext', 'nucl_acid_amp',
	// MIGS/MIMAG context
	'ref_biomaterial', 'isol_growth_condt', 'tax_ident'
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

export function exportMixsTsv(options: {
	projectId?: string;
	checklist?: string;
	extension?: string;
} = {}): string {
	const db = getDb();
	// Site fields are joined in and aliased under their MIxS slot names.
	const siteSelect = SITE_SLOT_COLUMNS.map((c) => `st.${c} AS site_${c}`).join(', ');
	let query = `SELECT s.*, ${siteSelect}, p.project_name AS proj_project_name
		FROM samples s
		JOIN sites st ON st.id = s.site_id
		JOIN projects p ON p.id = s.project_id
		WHERE s.is_deleted = 0`;
	const params: string[] = [];
	if (options.projectId) { query += ' AND s.project_id = ?'; params.push(options.projectId); }
	if (options.checklist) { query += ' AND s.mixs_checklist = ?'; params.push(options.checklist); }
	query += ' ORDER BY s.samp_name';
	const rows = db.prepare(query).all(...params) as Record<string, unknown>[];

	// Column order: checklist/extension selectors + core + sample slots + site slots.
	const columns: { header: string; source: string }[] = [
		{ header: '*samp_name', source: 'samp_name' },
		{ header: '*collection_date', source: 'collection_date' },
		{ header: '*env_medium', source: 'env_medium' },
		{ header: '*lat_lon', source: 'site_lat_lon' },
		{ header: '*geo_loc_name', source: 'site_geo_loc_name' },
		{ header: '*env_broad_scale', source: 'site_env_broad_scale' },
		{ header: '*env_local_scale', source: 'site_env_local_scale' },
		{ header: 'project_name', source: '__project_name__' },
		{ header: 'mixs_checklist', source: 'mixs_checklist' },
		{ header: 'extension', source: 'extension' }
	];
	for (const slot of SAMPLE_SLOT_COLUMNS) {
		if (['samp_name', 'collection_date', 'env_medium', 'project_name'].includes(slot)) continue;
		// Prefix `*` if this slot is MIxS-mandatory in general (doesn't check combination class).
		const isMandatory = getSlot(slot)?.required ?? false;
		columns.push({ header: (isMandatory ? '*' : '') + slot, source: slot });
	}

	const headers = columns.map((c) => c.header);
	const lines = rows.map((row) => {
		// Prefer sample.project_name if set; else fall back to the joined project record name.
		const projectName = (row.project_name as string | null) ?? (row.proj_project_name as string | null);
		return columns
			.map((c) => {
				if (c.source === '__project_name__') return escTsv(projectName);
				return escTsv(row[c.source]);
			})
			.join('\t');
	});

	return [headers.join('\t'), ...lines].join('\n');
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

	// SampleTown-specific aliases
	const local: Record<string, string> = {
		site_name: 'site_name',
		station: 'site_name',
		station_name: 'site_name',
		sample_name: 'samp_name',
		sample_title: 'samp_name',
		latitude: 'latitude',
		longitude: 'longitude',
		organism: 'samp_taxon_id',
		host: 'host_taxid',
		alt: 'elev',
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
			if (field.startsWith('custom:')) {
				const key = field.slice('custom:'.length);
				if (key) customFields[key] = val;
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
