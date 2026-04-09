// ============================================================
// Core entity types
// ============================================================

export interface User {
	id: string;
	github_id: number | null;
	username: string;
	display_name: string | null;
	email: string | null;
	avatar_url: string | null;
	role: 'admin' | 'user' | 'viewer';
	is_local_account: number;
	created_at: string;
	updated_at: string;
}

export interface Project {
	id: string;
	project_name: string;
	description: string | null;
	pi_name: string | null;
	institution: string | null;
	github_repo: string | null;
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

export type MixsChecklist =
	| 'MIMARKS-SU'
	| 'MIMARKS-SP'
	| 'MIMS'
	| 'MIMAG'
	| 'MISAG'
	| 'MIGS-EU'
	| 'MIGS-BA'
	| 'MIGS-PL'
	| 'MIGS-VI'
	| 'MIGS-ORG'
	| 'MIUViG';

export type EnvPackage =
	| 'water'
	| 'soil'
	| 'sediment'
	| 'host-associated'
	| 'air'
	| 'built'
	| 'plant-associated'
	| 'agriculture';

export interface Sample {
	id: string;
	project_id: string;
	mixs_checklist: MixsChecklist;

	// MIxS core
	samp_name: string;
	collection_date: string;
	lat_lon: string;
	latitude: number | null;
	longitude: number | null;
	geo_loc_name: string;
	env_broad_scale: string;
	env_local_scale: string;
	env_medium: string;
	samp_taxon_id: string | null;

	// Environmental package
	env_package: EnvPackage;
	depth: string | null;
	elevation: string | null;
	host_taxon_id: string | null;

	// MIGS/MIMS/MISAG/MIMAG-specific
	assembly_software: string | null;
	number_of_contigs: number | null;
	genome_coverage: string | null;
	reference_genome: string | null;
	annotation_source: string | null;

	// Environmental measurements
	temp: number | null;
	salinity: number | null;
	ph: number | null;
	dissolved_oxygen: number | null;
	pressure: number | null;
	turbidity: number | null;
	chlorophyll: number | null;
	nitrate: number | null;
	phosphate: number | null;

	// Logistics
	sample_type: string | null;
	volume_filtered_ml: number | null;
	filter_type: string | null;
	preservation_method: string | null;
	storage_conditions: string | null;
	collector_name: string | null;

	notes: string | null;
	custom_fields: string | null;

	// Sync
	client_id: string | null;
	local_created_at: string | null;
	sync_version: number;
	is_deleted: number;

	created_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface Extract {
	id: string;
	sample_id: string;
	extract_name: string;
	extraction_date: string | null;
	extraction_method: string | null;
	extraction_kit: string | null;
	concentration_ng_ul: number | null;
	total_volume_ul: number | null;
	a260_280: number | null;
	a260_230: number | null;
	quantification_method: string | null;
	storage_location: string | null;
	notes: string | null;
	custom_fields: string | null;
	sync_version: number;
	is_deleted: number;
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

export type TargetGene = '16S' | '18S' | 'CO1' | '12S' | 'ITS' | 'other';

export interface PcrAmplification {
	id: string;
	extract_id: string;
	pcr_name: string;
	target_gene: TargetGene;
	target_subfragment: string | null;
	forward_primer_name: string | null;
	forward_primer_seq: string | null;
	reverse_primer_name: string | null;
	reverse_primer_seq: string | null;
	pcr_conditions: string | null;
	annealing_temp_c: number | null;
	num_cycles: number | null;
	polymerase: string | null;
	pcr_date: string | null;
	band_observed: number | null;
	concentration_ng_ul: number | null;
	notes: string | null;
	custom_fields: string | null;
	sync_version: number;
	is_deleted: number;
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

export type LibraryType =
	| '16S_amplicon'
	| '18S_amplicon'
	| 'CO1_amplicon'
	| '12S_amplicon'
	| 'nanopore_metagenomic'
	| 'illumina_metagenomic'
	| 'rnaseq'
	| 'other';

export type Platform = 'ILLUMINA' | 'OXFORD_NANOPORE' | 'PACBIO' | 'ION_TORRENT' | 'other';

export interface LibraryPrep {
	id: string;
	pcr_id: string | null;
	extract_id: string | null;
	library_name: string;
	library_type: LibraryType;
	library_prep_kit: string | null;
	library_prep_date: string | null;
	platform: Platform | null;
	instrument_model: string | null;
	index_sequence_i7: string | null;
	index_sequence_i5: string | null;
	barcode: string | null;
	fragment_size_bp: number | null;
	final_concentration_ng_ul: number | null;
	notes: string | null;
	custom_fields: string | null;
	sync_version: number;
	is_deleted: number;
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface SequencingRun {
	id: string;
	run_name: string;
	run_date: string | null;
	platform: Platform;
	instrument_model: string | null;
	seq_meth: string;
	flow_cell_id: string | null;
	run_directory: string | null;
	fastq_directory: string | null;
	total_reads: number | null;
	total_bases: number | null;
	notes: string | null;
	custom_fields: string | null;
	sync_version: number;
	is_deleted: number;
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface RunLibrary {
	run_id: string;
	library_id: string;
	fastq_r1: string | null;
	fastq_r2: string | null;
	fastq_single: string | null;
	read_count: number | null;
}

export type AnalysisStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Analysis {
	id: string;
	run_id: string;
	pipeline: 'danaseq' | 'microscape-nf' | 'custom';
	pipeline_version: string | null;
	pipeline_profile: string | null;
	nextflow_run_name: string | null;
	nextflow_session_id: string | null;
	status: AnalysisStatus;
	input_directory: string | null;
	output_directory: string | null;
	reference_db: string | null;
	extra_params: string | null;
	results_summary: string | null;
	report_url: string | null;
	launched_at: string | null;
	completed_at: string | null;
	notes: string | null;
	created_by: string | null;
	created_at: string;
	updated_at: string;
}
