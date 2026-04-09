import type { MixsChecklist } from '$lib/types';

export interface ChecklistInfo {
	id: MixsChecklist;
	name: string;
	description: string;
	/** Additional required fields beyond the core MIxS set */
	requiredFields: string[];
	/** Recommended fields for this checklist */
	recommendedFields: string[];
}

export const CHECKLISTS: Record<MixsChecklist, ChecklistInfo> = {
	'MIMARKS-SU': {
		id: 'MIMARKS-SU',
		name: 'MIMARKS Survey',
		description: 'Marker gene sequences obtained directly from the environment',
		requiredFields: ['target_gene', 'pcr_primers', 'seq_meth'],
		recommendedFields: ['target_subfragment', 'pcr_conditions', 'nucl_acid_amp']
	},
	'MIMARKS-SP': {
		id: 'MIMARKS-SP',
		name: 'MIMARKS Specimen',
		description: 'Marker gene sequences from cultured or voucher-identifiable specimens',
		requiredFields: ['target_gene', 'pcr_primers', 'seq_meth', 'isol_growth_condt'],
		recommendedFields: ['target_subfragment', 'biotic_relationship', 'host_taxon_id']
	},
	'MIMS': {
		id: 'MIMS',
		name: 'MIMS',
		description: 'Metagenome/environmental sequences',
		requiredFields: ['seq_meth', 'assembly_software'],
		recommendedFields: ['number_of_contigs', 'genome_coverage']
	},
	'MIMAG': {
		id: 'MIMAG',
		name: 'MIMAG',
		description: 'Metagenome-assembled genome sequences',
		requiredFields: [
			'seq_meth',
			'assembly_software',
			'number_of_contigs',
			'genome_coverage',
			'compl_score',
			'contam_score',
			'bin_param',
			'bin_software'
		],
		recommendedFields: ['reassembly_bin', 'tax_ident']
	},
	'MISAG': {
		id: 'MISAG',
		name: 'MISAG',
		description: 'Single amplified genome sequences',
		requiredFields: [
			'seq_meth',
			'assembly_software',
			'number_of_contigs',
			'genome_coverage',
			'compl_score',
			'contam_score',
			'single_cell_lysis',
			'wga_amp'
		],
		recommendedFields: ['tax_ident', 'sort_tech']
	},
	'MIGS-EU': {
		id: 'MIGS-EU',
		name: 'MIGS Eukaryote',
		description: 'Eukaryotic genome sequences',
		requiredFields: [
			'seq_meth',
			'assembly_software',
			'number_of_contigs',
			'genome_coverage',
			'annotation_source'
		],
		recommendedFields: ['reference_genome', 'ploidy']
	},
	'MIGS-BA': {
		id: 'MIGS-BA',
		name: 'MIGS Bacteria/Archaea',
		description: 'Bacterial and archaeal genome sequences',
		requiredFields: [
			'seq_meth',
			'assembly_software',
			'number_of_contigs',
			'genome_coverage',
			'isol_growth_condt'
		],
		recommendedFields: ['reference_genome', 'num_replicons', 'annotation_source']
	},
	'MIGS-PL': {
		id: 'MIGS-PL',
		name: 'MIGS Plasmid',
		description: 'Plasmid sequences',
		requiredFields: [
			'seq_meth',
			'assembly_software',
			'number_of_contigs',
			'propagation'
		],
		recommendedFields: ['genome_coverage', 'annotation_source']
	},
	'MIGS-VI': {
		id: 'MIGS-VI',
		name: 'MIGS Virus',
		description: 'Viral genome sequences',
		requiredFields: [
			'seq_meth',
			'assembly_software',
			'number_of_contigs',
			'propagation'
		],
		recommendedFields: ['genome_coverage', 'host_taxon_id']
	},
	'MIGS-ORG': {
		id: 'MIGS-ORG',
		name: 'MIGS Organelle',
		description: 'Organelle sequences',
		requiredFields: [
			'seq_meth',
			'assembly_software',
			'number_of_contigs',
			'genome_coverage'
		],
		recommendedFields: ['annotation_source']
	},
	'MIUViG': {
		id: 'MIUViG',
		name: 'MIUViG',
		description: 'Uncultivated virus genomes',
		requiredFields: [
			'seq_meth',
			'assembly_software',
			'vir_ident_software',
			'pred_genome_type',
			'pred_genome_struc',
			'detec_type',
			'source_uvig'
		],
		recommendedFields: ['number_of_contigs', 'host_pred_approach']
	}
};

export const CHECKLIST_OPTIONS = Object.values(CHECKLISTS).map((c) => ({
	value: c.id,
	label: c.name,
	description: c.description
}));
