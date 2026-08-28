/**
 * Which columns each sheet format carries, and where each one's value comes
 * from.
 *
 * A column's `source` is a key on the assembled export row. Sample columns are
 * bare (`samp_name`); the chain each carry a table prefix (`ext_`, `pcr_`,
 * `lib_`, `rl_`, `run_`) because the same field name means different things on
 * different tables — `notes` and `accession` exist on nearly all of them.
 * `__name__` sources are computed by the exporter.
 */
import type { ExportColumn } from './mixs-io';
import {
	chooseExportColumns,
	SAMPLE_SLOT_COLUMNS,
	SITE_SLOT_COLUMNS
} from './mixs-io';
import { columnVocabulary } from '$lib/mixs/vocabulary';
import type { SheetFormat } from '$lib/sheet-formats';

const col = (
	header: string,
	source: string,
	vocabulary: ExportColumn['vocabulary']
): ExportColumn => ({ header, source, required: false, vocabulary });

/**
 * NCBI's SRA_data sheet, column for column and in its order, as shipped in
 * SRA_metadata.xlsx. Names are NCBI's — `library_ID`, not `library_name` — so
 * a filled sheet can be handed to the submission portal unedited.
 *
 * SampleTown's `library_type` is the SRA library strategy (see sra-mapping),
 * and the read files come off the run link rather than the run: a run is a
 * flow cell, and the files belong to one library on it.
 */
const SRA_COLUMNS: ExportColumn[] = [
	col('sample_name', 'samp_name', 'mixs'),
	col('library_ID', 'lib_library_name', 'insdc'),
	// NCBI wants a short free-text title per library. SampleTown has no field
	// for one, and inventing it from other columns would put words in the
	// submitter's mouth, so it is left for them to write.
	col('title', '__blank__', 'insdc'),
	col('library_strategy', 'lib_library_type', 'insdc'),
	col('library_source', 'lib_library_source', 'insdc'),
	col('library_selection', 'lib_library_selection', 'insdc'),
	col('library_layout', 'lib_layout', 'insdc'),
	col('platform', 'lib_platform', 'insdc'),
	col('instrument_model', 'lib_instrument_model', 'insdc'),
	col('design_description', 'lib_notes', 'insdc'),
	col('filetype', '__filetype__', 'insdc'),
	col('filename', '__filename__', 'insdc'),
	col('filename2', '__filename2__', 'insdc'),
	col('filename3', '__blank__', 'insdc'),
	col('filename4', '__blank__', 'insdc'),
	col('assembly', '__blank__', 'insdc'),
	col('fasta_file', '__blank__', 'insdc')
];

/**
 * SampleTown's own columns across the chain, named as the importer reads them
 * so an exported sheet round-trips. Ordered by the record they describe, which
 * is the order the records are made in.
 */
const SAMPLETOWN_COLUMNS: ExportColumn[] = [
	col('samp_name', 'samp_name', 'sampletown'),
	col('project_name', '__project_name__', 'mixs'),
	col('project_accession', '__project_accession__', 'insdc'),
	col('accession', 'accession', 'insdc'),
	col('mixs_checklist', 'mixs_checklist', 'sampletown'),
	col('extension', 'extension', 'sampletown'),
	col('notes', 'notes', 'sampletown'),
	col('collector_name', 'collector_name', 'sampletown'),
	// Site
	col('site_name', 'site_site_name', 'sampletown'),
	col('site_code', 'site_site_code', 'sampletown'),
	col('latitude', 'site_latitude', 'sampletown'),
	col('longitude', 'site_longitude', 'sampletown'),
	// Extract
	col('extract_name', 'ext_extract_name', 'sampletown'),
	col('extract_accession', 'ext_accession', 'insdc'),
	col('extraction_date', 'ext_extraction_date', 'sampletown'),
	col('concentration_ng_ul', 'ext_concentration_ng_ul', 'sampletown'),
	col('storage_box', 'ext_storage_box', 'sampletown'),
	col('storage_location', 'ext_storage_location', 'sampletown'),
	col('extract_notes', 'ext_notes', 'sampletown'),
	col('nucl_acid_ext', 'ext_nucl_acid_ext', 'mixs'),
	// PCR
	col('pcr_name', 'pcr_pcr_name', 'sampletown'),
	col('pcr_accession', 'pcr_accession', 'insdc'),
	col('pcr_plate_name', 'pcr_plate_name', 'sampletown'),
	col('pcr_date', 'pcr_pcr_date', 'sampletown'),
	// target_gene belongs to the primer set, so a reaction with none carries it
	// in custom_fields until one is linked; nucl_acid_amp is the same story.
	col('target_gene', '__pcr_target_gene__', 'mixs'),
	col('target_subfragment', 'pcr_target_subfragment', 'mixs'),
	col('pcr_cond', 'pcr_pcr_cond', 'mixs'),
	col('nucl_acid_amp', '__pcr_nucl_acid_amp__', 'mixs'),
	col('forward_primer_name', 'pcr_forward_primer_name', 'sampletown'),
	col('forward_primer_seq', 'pcr_forward_primer_seq', 'sampletown'),
	col('reverse_primer_name', 'pcr_reverse_primer_name', 'sampletown'),
	col('reverse_primer_seq', 'pcr_reverse_primer_seq', 'sampletown'),
	col('annealing_temp_c', 'pcr_annealing_temp_c', 'sampletown'),
	col('num_cycles', 'pcr_num_cycles', 'sampletown'),
	col('pcr_notes', 'pcr_notes', 'sampletown'),
	// Library
	col('library_name', 'lib_library_name', 'sampletown'),
	col('library_accession', 'lib_accession', 'insdc'),
	col('library_plate_name', 'lib_plate_name', 'sampletown'),
	col('library_type', 'lib_library_type', 'insdc'),
	col('library_source', 'lib_library_source', 'insdc'),
	col('library_selection', 'lib_library_selection', 'insdc'),
	col('library_prep_kit', 'lib_library_prep_kit', 'sampletown'),
	col('library_prep_date', 'lib_library_prep_date', 'sampletown'),
	col('library_platform', 'lib_platform', 'insdc'),
	col('library_instrument_model', 'lib_instrument_model', 'insdc'),
	col('library_barcode', 'lib_barcode', 'sampletown'),
	col('library_fragment_size_bp', 'lib_fragment_size_bp', 'sampletown'),
	col('library_concentration_ng_ul', 'lib_final_concentration_ng_ul', 'sampletown'),
	col('library_notes', 'lib_notes', 'sampletown'),
	// Run — a flow cell, and this library's reads off it
	col('run_name', 'run_run_name', 'sampletown'),
	col('run_submission_accession', 'run_accession', 'insdc'),
	col('run_accession_id', 'rl_accession', 'insdc'),
	col('run_date', 'run_run_date', 'sampletown'),
	col('run_platform', 'run_platform', 'insdc'),
	col('run_instrument_model', 'run_instrument_model', 'insdc'),
	col('run_flow_cell_id', 'run_flow_cell_id', 'sampletown'),
	col('run_directory', 'run_run_directory', 'sampletown'),
	col('run_fastq_dir', 'run_fastq_directory', 'sampletown'),
	col('run_read_count', 'rl_read_count', 'insdc'),
	col('run_fastq_bytes', 'rl_fastq_bytes', 'insdc'),
	col('run_fastq_r1', 'rl_fastq_r1', 'insdc'),
	col('run_fastq_r1_md5', 'rl_fastq_r1_md5', 'insdc'),
	col('run_fastq_r2', 'rl_fastq_r2', 'insdc'),
	col('run_fastq_r2_md5', 'rl_fastq_r2_md5', 'insdc'),
	col('run_fastq_single', 'rl_fastq_single', 'insdc'),
	col('run_fastq_single_md5', 'rl_fastq_single_md5', 'insdc')
];

/**
 * SampleTown's sheet: everything the app keeps in a column of its own.
 *
 * That includes the sample and site columns whose names come from MIxS —
 * collection_date is a MIxS slot and a real column on `samples`, and a sheet
 * of SampleTown's records that omitted it would not read back. What it leaves
 * out is the rest of a MIxS class: the hundreds of slots that live in the EAV
 * only when someone supplied them. Those are what "Everything" adds.
 */
function sampletownColumns(): ExportColumn[] {
	const seen = new Set<string>();
	const out: ExportColumn[] = [];
	const add = (c: ExportColumn) => {
		if (seen.has(c.header)) return;
		seen.add(c.header);
		out.push(c);
	};
	add(SAMPLETOWN_COLUMNS[0]);
	for (const slot of SAMPLE_SLOT_COLUMNS) add(col(slot, slot, columnVocabulary(slot)));
	for (const slot of SITE_SLOT_COLUMNS) add(col(slot, `site_${slot}`, columnVocabulary(slot)));
	for (const c of SAMPLETOWN_COLUMNS) add(c);
	return out;
}

/**
 * The columns for one sheet format.
 *
 * "Everything" is the three joined and de-duplicated by header, so a column
 * two formats both carry appears once, keeping whichever definition came
 * first — MIxS before SampleTown before SRA, since that is the order of
 * decreasing standardisation.
 */
export function sheetColumns(
	format: SheetFormat,
	checklist?: string,
	extension?: string
): ExportColumn[] {
	switch (format) {
		case 'sra':
			return SRA_COLUMNS;
		case 'sampletown':
			return sampletownColumns();
		case 'all': {
			const seen = new Set<string>();
			const out: ExportColumn[] = [];
			for (const c of [
				...chooseExportColumns(checklist, extension),
				...sampletownColumns(),
				...SRA_COLUMNS
			]) {
				const key = c.header.replace(/^\*/, '');
				if (seen.has(key)) continue;
				seen.add(key);
				out.push(c);
			}
			return out;
		}
		case 'mixs':
		default:
			return chooseExportColumns(checklist, extension);
	}
}
