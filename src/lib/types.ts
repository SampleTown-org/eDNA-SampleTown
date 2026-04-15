// ============================================================
// Core entity types
// ============================================================

/** Lab (tenant). Every top-level entity carries a lab_id pointing here. */
export interface Lab {
	id: string;
	name: string;
	slug: string;
	github_repo: string | null;
	github_token: string | null;
	backup_interval_hours: number | null;
	last_backup_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface User {
	id: string;
	/** Lab membership. Null only for GitHub-OAuth signups that haven't yet
	 *  been approved + assigned to a lab by an admin. Once non-null, scoped
	 *  access to every lab-owned resource flows from this field. */
	lab_id: string | null;
	github_id: number | null;
	username: string;
	display_name: string | null;
	email: string | null;
	avatar_url: string | null;
	avatar_emoji: string | null;
	role: 'admin' | 'user' | 'viewer';
	is_local_account: number;
	is_approved: number;
	must_change_password: number;
	created_at: string;
	updated_at: string;
}

export interface Project {
	id: string;
	lab_id: string;
	project_name: string;
	description: string | null;
	pi_name: string | null;
	institution: string | null;
	contact_email: string | null;
	funding_sources: string | null;
	github_repo: string | null;
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface Site {
	id: string;
	lab_id: string;
	project_id: string;
	site_name: string;
	description: string | null;
	lat_lon: string | null;
	latitude: number | null;
	longitude: number | null;
	geo_loc_name: string | null;
	locality: string | null;
	env_broad_scale: string | null;
	env_local_scale: string | null;
	access_notes: string | null;
	notes: string | null;
	custom_fields: string | null;
	sync_version: number;
	is_deleted: number;
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

/**
 * MIxS checklist class name (LinkML class in mixs.yaml).
 * The valid set is defined by the active MIxS schema version; enumerating it
 * here as a string type avoids shipping a redundant enum literal.
 */
export type MixsChecklist = string;

/** MIxS Extension class name (formerly env_package). Same sourcing rationale as MixsChecklist. */
export type MixsExtension = string;

export interface Sample {
	id: string;
	lab_id: string;
	project_id: string;
	site_id: string;
	mixs_checklist: MixsChecklist;
	extension: MixsExtension | null;

	// MIxS core
	samp_name: string;
	collection_date: string;
	env_medium: string;

	// Extension-specific location context
	depth: string | null;
	elev: string | null;

	// Host-associated
	host_taxid: string | null;
	specific_host: string | null;

	// Environmental measurements
	temp: number | null;
	salinity: number | null;
	ph: number | null;
	diss_oxygen: number | null;
	pressure: number | null;
	turbidity: number | null;
	chlorophyll: number | null;
	nitrate: number | null;
	phosphate: number | null;

	// Sampling
	samp_collect_device: string | null;
	samp_collect_method: string | null;
	samp_mat_process: string | null;
	samp_size: string | null;
	size_frac: string | null;
	source_mat_id: string | null;

	// Storage
	samp_store_sol: string | null;
	samp_store_temp: string | null;
	samp_store_dur: string | null;
	samp_store_loc: string | null;
	store_cond: string | null;

	// MIGS/MIMAG/MISAG context
	ref_biomaterial: string | null;
	isol_growth_condt: string | null;
	tax_ident: string | null;

	// SampleTown-local extras
	filter_type: string | null;
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
	lab_id: string;
	sample_id: string;
	extract_name: string;
	extraction_date: string | null;
	extraction_method: string | null;
	nucl_acid_ext_kit: string | null;
	nucl_acid_ext: string | null;
	samp_taxon_id: string | null;
	samp_vol_we_dna_ext: string | null;
	pool_dna_extracts: string | null;
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

export interface PcrPlate {
	id: string;
	lab_id: string;
	plate_name: string;
	pcr_date: string | null;
	primer_set_id: string | null;
	target_subfragment: string | null;
	forward_primer_name: string | null;
	forward_primer_seq: string | null;
	reverse_primer_name: string | null;
	reverse_primer_seq: string | null;
	pcr_cond: string | null;
	annealing_temp_c: number | null;
	num_cycles: number | null;
	polymerase: string | null;
	nucl_acid_amp: string | null;
	notes: string | null;
	custom_fields: string | null;
	sync_version: number;
	is_deleted: number;
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface PcrAmplification {
	id: string;
	lab_id: string;
	plate_id: string | null;
	extract_id: string;
	pcr_name: string;
	primer_set_id: string | null;
	target_subfragment: string | null;
	forward_primer_name: string | null;
	forward_primer_seq: string | null;
	reverse_primer_name: string | null;
	reverse_primer_seq: string | null;
	pcr_cond: string | null;
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

/** Operator-managed vocabulary — no hardcoded enum. */
export type LibraryType = string;

export type Platform = 'ILLUMINA' | 'OXFORD_NANOPORE' | 'PACBIO' | 'ION_TORRENT' | 'other';

export interface LibraryPlate {
	id: string;
	lab_id: string;
	plate_name: string;
	library_prep_date: string | null;
	library_type: LibraryType;
	library_source: string | null;
	library_selection: string | null;
	library_prep_kit: string | null;
	platform: Platform | null;
	instrument_model: string | null;
	fragment_size_bp: number | null;
	pcr_plate_id: string | null;
	notes: string | null;
	custom_fields: string | null;
	sync_version: number;
	is_deleted: number;
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface LibraryPrep {
	id: string;
	lab_id: string;
	library_plate_id: string | null;
	pcr_id: string | null;
	extract_id: string | null;
	library_name: string;
	library_type: LibraryType;
	library_source: string | null;
	library_selection: string | null;
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
	lab_id: string;
	run_name: string;
	run_date: string | null;
	platform: Platform;
	instrument_model: string | null;
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
	lab_id: string;
	run_id: string;
	pipeline: string;
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
