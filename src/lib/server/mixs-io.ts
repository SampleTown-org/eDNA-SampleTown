import { getDb } from './db';
import { CORE_FIELDS, PACKAGE_FIELDS, MEASUREMENT_FIELDS, LOGISTICS_FIELDS } from '$lib/mixs/fields';
import * as XLSX from 'xlsx';

/** Fields that live on the sites table (location/environment context). */
export const SITE_FIELDS = new Set([
	'lat_lon', 'latitude', 'longitude', 'geo_loc_name',
	'env_broad_scale', 'env_local_scale'
]);

/** MIxS v6 TSV column definitions — maps internal field names to SRA/BioSample column headers.
 *  Follows GSC MIxS v6 structured comment names. */
const EXPORT_COLUMNS = [
	// MIxS v6 mandatory (M) fields — investigation section
	{ header: '*sample_name', field: 'samp_name' },
	{ header: 'sample_title', field: 'samp_name' },
	{ header: '*organism', field: 'samp_taxon_id', default: 'metagenome' },
	{ header: '*project_name', field: 'project_name' },
	// MIxS v6 mandatory (M) fields — environment section
	{ header: '*collection_date', field: 'collection_date' },
	{ header: '*geo_loc_name', field: 'geo_loc_name' },
	{ header: '*lat_lon', field: 'lat_lon' },
	{ header: '*env_broad_scale', field: 'env_broad_scale' },
	{ header: '*env_local_scale', field: 'env_local_scale' },
	{ header: '*env_medium', field: 'env_medium' },
	// MIxS v6 environment-dependent (E) fields
	{ header: 'env_package', field: '_env_package_' },
	{ header: 'depth', field: 'depth' },
	{ header: 'alt', field: 'elevation' },
	{ header: 'elev', field: 'elevation' },
	{ header: 'temp', field: 'temp' },
	// Host
	{ header: 'host', field: 'host_taxon_id' },
	// MIxS v6 optional environmental measurements
	{ header: 'salinity', field: 'salinity' },
	{ header: 'ph', field: 'ph' },
	{ header: 'diss_oxygen', field: 'dissolved_oxygen' },
	{ header: 'pressure', field: 'pressure' },
	{ header: 'turbidity', field: 'turbidity' },
	{ header: 'chlorophyll', field: 'chlorophyll' },
	{ header: 'nitrate', field: 'nitrate' },
	{ header: 'phosphate', field: 'phosphate' },
	// Sample logistics
	{ header: 'samp_vol_we_dna_ext', field: 'volume_filtered_ml' },
	{ header: 'filter_type', field: 'filter_type' },
	{ header: 'samp_store_sol', field: 'preservation_method' },
	{ header: 'samp_store_temp', field: 'storage_conditions' },
	{ header: 'collected_by', field: 'collector_name' },
	{ header: 'sample_type', field: 'sample_type' },
	// Checklist identifier
	{ header: 'mixs_checklist', field: 'mixs_checklist' },
];

function escTsv(val: unknown): string {
	if (val == null || val === '') return 'not collected';
	const s = String(val);
	if (s.includes('\t') || s.includes('\n') || s.includes('"')) {
		return '"' + s.replace(/"/g, '""') + '"';
	}
	return s;
}

export function exportMixsTsv(options: { projectId?: string; checklist?: string; envPackage?: string } = {}): string {
	const db = getDb();
	let query = `SELECT s.*, st.lat_lon, st.geo_loc_name, st.env_broad_scale, st.env_local_scale,
		p.project_name
		FROM samples s
		JOIN sites st ON st.id = s.site_id
		JOIN projects p ON p.id = s.project_id
		WHERE s.is_deleted = 0`;
	const params: string[] = [];
	if (options.projectId) { query += ' AND s.project_id = ?'; params.push(options.projectId); }
	if (options.checklist) { query += ' AND s.mixs_checklist = ?'; params.push(options.checklist); }
	query += ' ORDER BY s.samp_name';

	const samples = db.prepare(query).all(...params) as Record<string, unknown>[];

	const envPackage = options.envPackage || 'water';

	// Deduplicate columns (elev/alt both map to elevation — only emit once)
	const seen = new Set<string>();
	const columns = EXPORT_COLUMNS.filter(c => {
		if (c.header === 'alt') return false; // skip alt, keep elev
		if (c.header === 'sample_title') return false; // skip duplicate of sample_name
		if (seen.has(c.field)) return false;
		seen.add(c.field);
		return true;
	});

	const headers = columns.map(c => c.header.replace(/^\*/, ''));
	const rows = samples.map(sample =>
		columns.map(col => {
			// env_package is a parameter, not stored in DB
			if (col.field === '_env_package_') return envPackage;
			const val = sample[col.field];
			if ((val == null || val === '') && col.default) return col.default;
			return escTsv(val);
		}).join('\t')
	);

	return [headers.join('\t'), ...rows].join('\n');
}

/** Parse xlsx file buffer into TSV string */
export function xlsxToTsv(buffer: Buffer): string {
	const wb = XLSX.read(buffer, { type: 'buffer' });
	const ws = wb.Sheets[wb.SheetNames[0]];
	const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
	// Convert to TSV, preserving all rows (comment rows will be filtered by parser)
	return rows.map((row: unknown[]) => row.map(cell => cell ?? '').join('\t')).join('\n');
}

/**
 * Build the auto-detection map from lowercase file header → internal field name.
 * Exported so the column-mapper UI can call it directly.
 */
export function buildHeaderToFieldMap(): Record<string, string> {
	const headerToField: Record<string, string> = {};
	for (const col of EXPORT_COLUMNS) {
		const field = col.field === '_env_package_' ? '_skip_' : col.field;
		headerToField[col.header.toLowerCase().replace(/^\*/, '')] = field;
	}
	const allFields = [
		...CORE_FIELDS,
		...Object.values(PACKAGE_FIELDS).flat(),
		...MEASUREMENT_FIELDS,
		...LOGISTICS_FIELDS
	];
	for (const f of allFields) {
		headerToField[f.name.toLowerCase()] = f.name;
		if (f.sra_column) headerToField[f.sra_column.toLowerCase()] = f.name;
	}
	// Common aliases and NCBI BioSample column names (same as before).
	const aliases: Record<string, string> = {
		sample_name: 'samp_name',
		sample_title: 'samp_name',
		latitude: 'latitude',
		longitude: 'longitude',
		organism: 'samp_taxon_id',
		host: 'host_taxon_id',
		elev: 'elevation',
		alt: 'elevation',
		diss_oxygen: 'dissolved_oxygen',
		description: 'notes',
		assembly_software: 'assembly_software',
		specific_host: 'host_taxon_id',
		number_contig: 'number_of_contigs'
	};
	for (const [k, v] of Object.entries(aliases)) headerToField[k] = v;

	// NCBI-only columns we deliberately skip.
	const skip = [
		'bioproject_accession', 'strain', 'isolate', 'cultivar', 'ecotype',
		'isol_growth_condt', 'biotic_relationship', 'collection_method',
		'isolation_source', 'neg_cont_type', 'pos_cont_type', 'rel_to_oxygen',
		'samp_collect_device', 'samp_mat_process', 'samp_size',
		'source_material_id', 'subspecf_gen_lin', 'trophic_level',
		'extrachrom_elements', 'omics_observ_id', 'target_gene',
		'target_subfragment', 'pcr_primers', 'pcr_cond', 'nucl_acid_ext',
		'nucl_acid_amp', 'lib_layout', 'lib_size', 'lib_vector', 'seq_meth',
		'chimera_check', 'samp_collec_device', 'samp_collec_method',
		'size_frac', 'host_disease_stat', 'host_spec_range', 'pathogenicity',
		'propagation', 'encoded_traits', 'estimated_size', 'ref_biomaterial',
		'source_mat_id', 'num_replicons', 'ploidy', 'experimental_factor',
		'assembly_qual', 'assembly_name', 'annot', 'feat_pred', 'ref_db',
		'sim_search_meth', 'tax_class', 'associated resource', 'sop',
		'lib_reads_seqd', 'lib_screen', 'mid', 'adapters', 'seq_quality_check',
		'project_name', 'env_package'
	];
	for (const s of skip) headerToField[s] = '_skip_';

	return headerToField;
}

/**
 * Return the list of internal field names that can be targeted by an import
 * column mapping, with table prefix (e.g. "site: lat_lon", "sample: nitrate").
 */
export function getImportableFields(): { value: string; label: string }[] {
	const fields = new Set<string>();
	for (const col of EXPORT_COLUMNS) {
		if (col.field !== '_env_package_') fields.add(col.field);
	}
	const allFields = [
		...CORE_FIELDS,
		...Object.values(PACKAGE_FIELDS).flat(),
		...MEASUREMENT_FIELDS,
		...LOGISTICS_FIELDS
	];
	for (const f of allFields) fields.add(f.name);
	fields.delete('_skip_');
	fields.delete('project_name');

	return Array.from(fields).sort().map(f => ({
		value: f,
		label: SITE_FIELDS.has(f) ? `site: ${f}` : `sample: ${f}`
	}));
}

/** Parse a MIxS TSV string into sample objects ready for insertion.
 *  Handles NCBI BioSample xlsx format: skips # comment rows, strips * from required field headers.
 *  Optional `overrideMap` lets the column-mapper UI force specific header→field mappings. */
export function parseMixsTsv(
	tsv: string,
	overrideMap?: Record<string, string>
): {
	samples: Record<string, unknown>[];
	errors: string[];
	headers: string[];
	column_map: Record<string, string>;
} {
	let lines = tsv.trim().split('\n');

	// Skip NCBI comment rows (start with #)
	const dataLines = lines.filter(l => !l.startsWith('#'));
	if (dataLines.length < 2) return { samples: [], errors: ['File must have a header row and at least one data row'], headers: [] };

	// Strip leading * from required field markers (NCBI convention)
	const headers = dataLines[0].split('\t').map((h) => h.trim().replace(/^\*/, '').toLowerCase());
	lines = dataLines;
	const errors: string[] = [];
	const samples: Record<string, unknown>[] = [];

	const autoMap = buildHeaderToFieldMap();

	// Resolve each header → field using the override first, then auto-detection.
	// column_map is returned so the UI knows what was detected / applied.
	const column_map: Record<string, string> = {};
	const colMap: { index: number; field: string }[] = [];
	const unmapped: string[] = [];
	headers.forEach((h, i) => {
		const override = overrideMap?.[h];
		// Override can explicitly force _skip_ to drop a column the auto-map would pick up.
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

	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;

		const values = parseTsvLine(line);
		const sample: Record<string, unknown> = {};
		const customFields: Record<string, unknown> = {};

		for (const { index, field } of colMap) {
			let val: unknown = values[index]?.trim() ?? null;
			if (val === '' || val === 'not collected' || val === 'not applicable' || val === 'missing') {
				val = null;
			}
			// Special prefix "custom:<key>" routes the value into a custom_fields
			// JSON blob on the sample row instead of a named column. Used by
			// the column mapper UI's "add as custom field" option.
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

		// Validation
		if (!sample.samp_name) {
			errors.push(`Row ${i + 1}: missing sample_name`);
			continue;
		}
		if (!sample.collection_date) {
			errors.push(`Row ${i + 1} (${sample.samp_name}): missing collection_date`);
		}

		// Compose lat_lon if we have separate lat/lng but no lat_lon
		if (!sample.lat_lon && sample.latitude && sample.longitude) {
			const lat = Number(sample.latitude);
			const lng = Number(sample.longitude);
			if (!isNaN(lat) && !isNaN(lng)) {
				const ns = lat >= 0 ? 'N' : 'S';
				const ew = lng >= 0 ? 'E' : 'W';
				sample.lat_lon = `${Math.abs(lat).toFixed(4)} ${ns} ${Math.abs(lng).toFixed(4)} ${ew}`;
			}
		}

		// Default checklist
		if (!sample.mixs_checklist) sample.mixs_checklist = 'MIMARKS-SU';

		// Parse numeric fields
		for (const numField of ['temp', 'salinity', 'ph', 'dissolved_oxygen', 'pressure', 'turbidity', 'chlorophyll', 'nitrate', 'phosphate', 'volume_filtered_ml', 'latitude', 'longitude']) {
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
