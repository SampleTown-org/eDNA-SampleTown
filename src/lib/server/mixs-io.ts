import { getDb } from './db';
import { CORE_FIELDS, PACKAGE_FIELDS, MEASUREMENT_FIELDS, LOGISTICS_FIELDS } from '$lib/mixs/fields';
import * as XLSX from 'xlsx';

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
	{ header: 'env_package', field: 'env_package' },
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

export function exportMixsTsv(options: { projectId?: string; checklist?: string } = {}): string {
	const db = getDb();
	let query = `SELECT s.*, p.project_name FROM samples s JOIN projects p ON p.id = s.project_id WHERE s.is_deleted = 0`;
	const params: string[] = [];
	if (options.projectId) { query += ' AND s.project_id = ?'; params.push(options.projectId); }
	if (options.checklist) { query += ' AND s.mixs_checklist = ?'; params.push(options.checklist); }
	query += ' ORDER BY s.samp_name';

	const samples = db.prepare(query).all(...params) as Record<string, unknown>[];

	// Deduplicate columns (elev/alt both map to elevation — only emit once)
	const seen = new Set<string>();
	const columns = EXPORT_COLUMNS.filter(c => {
		const key = c.field + ':' + c.header.replace(/^\*/, '');
		if (c.header === 'alt') return false; // skip alt, keep elev
		if (c.header === 'sample_title') return false; // skip duplicate of sample_name
		if (seen.has(c.field)) return false;
		seen.add(c.field);
		return true;
	});

	const headers = columns.map(c => c.header.replace(/^\*/, ''));
	const rows = samples.map(sample =>
		columns.map(col => {
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

/** Parse a MIxS TSV string into sample objects ready for insertion.
 *  Handles NCBI BioSample xlsx format: skips # comment rows, strips * from required field headers. */
export function parseMixsTsv(tsv: string): { samples: Record<string, unknown>[]; errors: string[]; headers: string[] } {
	let lines = tsv.trim().split('\n');

	// Skip NCBI comment rows (start with #)
	const dataLines = lines.filter(l => !l.startsWith('#'));
	if (dataLines.length < 2) return { samples: [], errors: ['File must have a header row and at least one data row'], headers: [] };

	// Strip leading * from required field markers (NCBI convention)
	const headers = dataLines[0].split('\t').map(h => h.trim().replace(/^\*/, '').toLowerCase());
	lines = dataLines;
	const errors: string[] = [];
	const samples: Record<string, unknown>[] = [];

	// Build reverse mapping: SRA header -> internal field name
	const headerToField: Record<string, string> = {};
	for (const col of EXPORT_COLUMNS) {
		headerToField[col.header.toLowerCase()] = col.field;
	}
	// Also accept internal field names directly
	const allFields = [...CORE_FIELDS, ...Object.values(PACKAGE_FIELDS).flat(), ...MEASUREMENT_FIELDS, ...LOGISTICS_FIELDS];
	for (const f of allFields) {
		headerToField[f.name.toLowerCase()] = f.name;
		if (f.sra_column) headerToField[f.sra_column.toLowerCase()] = f.name;
	}
	// Common aliases and NCBI BioSample column names
	headerToField['sample_name'] = 'samp_name';
	headerToField['sample_title'] = 'samp_name';
	headerToField['latitude'] = 'latitude';
	headerToField['longitude'] = 'longitude';
	headerToField['organism'] = 'samp_taxon_id';
	headerToField['host'] = 'host_taxon_id';
	headerToField['elev'] = 'elevation';
	headerToField['alt'] = 'elevation';
	headerToField['diss_oxygen'] = 'dissolved_oxygen';
	headerToField['bioproject_accession'] = '_skip_';
	headerToField['description'] = 'notes';
	headerToField['strain'] = '_skip_';
	headerToField['isolate'] = '_skip_';
	headerToField['cultivar'] = '_skip_';
	headerToField['ecotype'] = '_skip_';
	headerToField['isol_growth_condt'] = '_skip_';
	headerToField['biotic_relationship'] = '_skip_';
	headerToField['collection_method'] = '_skip_';
	headerToField['isolation_source'] = '_skip_';
	headerToField['neg_cont_type'] = '_skip_';
	headerToField['pos_cont_type'] = '_skip_';
	headerToField['rel_to_oxygen'] = '_skip_';
	headerToField['samp_collect_device'] = '_skip_';
	headerToField['samp_mat_process'] = '_skip_';
	headerToField['samp_size'] = '_skip_';
	headerToField['source_material_id'] = '_skip_';
	headerToField['subspecf_gen_lin'] = '_skip_';
	headerToField['trophic_level'] = '_skip_';
	headerToField['extrachrom_elements'] = '_skip_';
	headerToField['omics_observ_id'] = '_skip_';
	headerToField['target_gene'] = '_skip_';
	headerToField['target_subfragment'] = '_skip_';
	headerToField['pcr_primers'] = '_skip_';
	headerToField['pcr_cond'] = '_skip_';
	headerToField['nucl_acid_ext'] = '_skip_';
	headerToField['nucl_acid_amp'] = '_skip_';
	headerToField['lib_layout'] = '_skip_';
	headerToField['lib_size'] = '_skip_';
	headerToField['lib_vector'] = '_skip_';
	headerToField['seq_meth'] = '_skip_';
	headerToField['chimera_check'] = '_skip_';
	headerToField['assembly_software'] = 'assembly_software';
	// MIxS v6 structured comment names
	headerToField['samp_collec_device'] = '_skip_';
	headerToField['samp_collec_method'] = '_skip_';
	headerToField['size_frac'] = '_skip_';
	headerToField['specific_host'] = 'host_taxon_id';
	headerToField['host_disease_stat'] = '_skip_';
	headerToField['host_spec_range'] = '_skip_';
	headerToField['pathogenicity'] = '_skip_';
	headerToField['propagation'] = '_skip_';
	headerToField['encoded_traits'] = '_skip_';
	headerToField['estimated_size'] = '_skip_';
	headerToField['ref_biomaterial'] = '_skip_';
	headerToField['source_mat_id'] = '_skip_';
	headerToField['num_replicons'] = '_skip_';
	headerToField['ploidy'] = '_skip_';
	headerToField['experimental_factor'] = '_skip_';
	headerToField['number_contig'] = 'number_of_contigs';
	headerToField['assembly_qual'] = '_skip_';
	headerToField['assembly_name'] = '_skip_';
	headerToField['annot'] = '_skip_';
	headerToField['feat_pred'] = '_skip_';
	headerToField['ref_db'] = '_skip_';
	headerToField['sim_search_meth'] = '_skip_';
	headerToField['tax_class'] = '_skip_';
	headerToField['associated resource'] = '_skip_';
	headerToField['sop'] = '_skip_';
	headerToField['lib_reads_seqd'] = '_skip_';
	headerToField['lib_screen'] = '_skip_';
	headerToField['mid'] = '_skip_';
	headerToField['adapters'] = '_skip_';
	headerToField['seq_quality_check'] = '_skip_';
	headerToField['project_name'] = '_skip_'; // already set via projectId param

	// Resolve column indices to field names
	const colMap: { index: number; field: string }[] = [];
	const unmapped: string[] = [];
	headers.forEach((h, i) => {
		const field = headerToField[h];
		if (field && field !== '_skip_') {
			colMap.push({ index: i, field });
		} else if (!field) {
			unmapped.push(h);
		}
		// _skip_ fields are silently ignored
	});

	if (unmapped.length > 0) {
		errors.push(`Unmapped columns (ignored): ${unmapped.join(', ')}`);
	}

	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;

		const values = parseTsvLine(line);
		const sample: Record<string, unknown> = {};

		for (const { index, field } of colMap) {
			let val: unknown = values[index]?.trim() ?? null;
			if (val === '' || val === 'not collected' || val === 'not applicable' || val === 'missing') {
				val = null;
			}
			sample[field] = val;
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
		if (!sample.env_package) sample.env_package = 'water';

		// Parse numeric fields
		for (const numField of ['temp', 'salinity', 'ph', 'dissolved_oxygen', 'pressure', 'turbidity', 'chlorophyll', 'nitrate', 'phosphate', 'volume_filtered_ml', 'latitude', 'longitude']) {
			if (sample[numField] != null) {
				const n = Number(sample[numField]);
				sample[numField] = isNaN(n) ? null : n;
			}
		}

		samples.push(sample);
	}

	return { samples, errors, headers };
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
