/**
 * Master mapping: MIxS slot → SampleTown entity table.
 *
 * MIxS is a composite checklist across all stages of a sequencing project.
 * SampleTown splits those stages across several tables, and each MIxS slot
 * belongs naturally to exactly one of them. This file is the single source
 * of truth for "where does this slot live".
 *
 * Defaults: any slot NOT in this map is assumed to be per-sample. Most MIxS
 * slots are environmental/chemical measurements that belong on samples, so
 * the map only enumerates the exceptions.
 *
 * The MIxS export joins across all tables to emit a complete row per sample.
 */

export type SampleTownTable =
	| 'samples'
	| 'sites'
	| 'projects'
	| 'extracts'
	| 'pcr_plates'
	| 'library_preps'
	| 'sequencing_runs'
	| 'analyses'; // Not currently supported by SampleTown — slots here can't be entered

/** Slots that do NOT belong on samples. Everything unmapped defaults to 'samples'. */
export const NON_SAMPLE_SLOTS: Record<string, SampleTownTable> = {
	// Sites — location + environmental context inherited by samples
	lat_lon: 'sites',
	geo_loc_name: 'sites',
	env_broad_scale: 'sites',
	env_local_scale: 'sites',

	// Projects — investigation-level shared across many samples
	project_name: 'projects',
	experimental_factor: 'projects',
	sop: 'projects',
	associated_resource: 'projects',
	investigation_type: 'projects',

	// Extracts — nucleic acid extraction protocol
	nucl_acid_ext: 'extracts',

	// PCR plates — amplification protocol + primers + controls
	nucl_acid_amp: 'pcr_plates',
	pcr_primers: 'pcr_plates',
	pcr_cond: 'pcr_plates',
	target_gene: 'pcr_plates',
	target_subfragment: 'pcr_plates',
	mid: 'pcr_plates',
	adapters: 'pcr_plates',
	neg_cont_type: 'pcr_plates',
	pos_cont_type: 'pcr_plates',

	// Library preps — layout, screening, reads sequenced
	lib_layout: 'library_preps',
	lib_size: 'library_preps',
	lib_vector: 'library_preps',
	lib_screen: 'library_preps',
	lib_reads_seqd: 'library_preps',
	barcode: 'library_preps',

	// Sequencing runs — the act of sequencing
	seq_meth: 'sequencing_runs',

	// Analyses — results of running a pipeline over the reads.
	// SampleTown doesn't currently import these; slots here are flagged
	// "not yet supported" in the completeness display.
	assembly_qual: 'analyses',
	assembly_software: 'analyses',
	assembly_name: 'analyses',
	number_contig: 'analyses',
	num_replicons: 'analyses',
	annot: 'analyses',
	feat_pred: 'analyses',
	sim_search_meth: 'analyses',
	ref_db: 'analyses',
	tax_class: 'analyses',
	tax_ident: 'analyses',
	bin_param: 'analyses',
	bin_software: 'analyses',
	compl_score: 'analyses',
	contam_score: 'analyses',
	compl_software: 'analyses',
	contam_software: 'analyses',
	pred_genome_type: 'analyses',
	pred_genome_struc: 'analyses',
	detec_type: 'analyses',
	source_uvig: 'analyses',
	single_cell_lysis: 'analyses',
	wga_amp: 'analyses',
	sort_tech: 'analyses',
	vir_ident_software: 'analyses',
	host_pred_approach: 'analyses',
	reassembly_bin: 'analyses',
	omics_observ_id: 'analyses',
	read_length: 'analyses',
	qc_checks: 'analyses',
	chimera_check: 'analyses',
	seq_quality_check: 'analyses'
};

/** Return the SampleTown table that owns a given MIxS slot. */
export function slotTable(slot: string): SampleTownTable {
	return NON_SAMPLE_SLOTS[slot] ?? 'samples';
}

/** Human-facing label for a table (for "→ extracts tab" style links). */
export function tableLabel(t: SampleTownTable): string {
	const map: Record<SampleTownTable, string> = {
		samples: 'samples',
		sites: 'sites',
		projects: 'projects',
		extracts: 'extracts',
		pcr_plates: 'PCR',
		library_preps: 'libraries',
		sequencing_runs: 'runs',
		analyses: 'analyses (not yet supported)'
	};
	return map[t];
}
