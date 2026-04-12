/**
 * Bidirectional map between MIxS slots and SRA / BioSample column names.
 *
 * Policy (see feedback_mixs_canonical.md): when a field exists in both
 * vocabularies, MIxS is the canonical storage layer. SampleTown stores MIxS
 * slot names and this file handles the translation at the import (SRA → MIxS)
 * and export (MIxS → SRA/BioSample) boundaries.
 *
 * What belongs here:
 *   - Slots with 1:1 mappings (geo_loc_name, lat_lon, collection_date, etc.)
 *   - Slots where SRA uses a different name (host → specific_host,
 *     organism → samp_taxon_id, isolation_source → env_medium)
 *   - Coarse SRA platform enum ↔ granular MIxS seq_meth OBI term (one-to-many,
 *     so the reverse direction needs a default).
 *
 * What does NOT belong:
 *   - SRA-only fields with no MIxS equivalent (library_strategy, library_source,
 *     library_selection). These live on library_plates/library_preps/
 *     sequencing_runs and round-trip as-is.
 */

/** SRA/BioSample column name → MIxS slot name. Many-to-one is fine (aliases). */
export const SRA_TO_MIXS: Record<string, string> = {
	// Direct-rename aliases (MIxS uses a different label)
	organism: 'samp_taxon_id',
	host: 'specific_host',
	isolation_source: 'env_medium',
	sample_title: 'samp_name',
	sample_name: 'samp_name',

	// Identity (same name, same meaning — kept explicit so the mapper's
	// reverse lookup works without inferring)
	collection_date: 'collection_date',
	geo_loc_name: 'geo_loc_name',
	lat_lon: 'lat_lon',
	env_broad_scale: 'env_broad_scale',
	env_local_scale: 'env_local_scale',
	env_medium: 'env_medium',
	host_taxid: 'host_taxid',
	specific_host: 'specific_host',
	samp_taxon_id: 'samp_taxon_id',
	samp_name: 'samp_name',
	project_name: 'project_name',

	// BioSample uses `alt` for elevation; MIxS 6.3 slot is `elev`
	alt: 'elev',
	elev: 'elev',

	// BioSample `collected_by` is free-text; no direct MIxS slot — route to
	// collector_name SampleTown-local column (not a MIxS slot)
	collected_by: 'collector_name',

	// BioSample `sample_collection_device_or_method` is a composite; MIxS
	// splits it. Prefer device; user can override in mapper.
	sample_collection_device_or_method: 'samp_collect_device'
};

/**
 * Coarse SRA `platform` enum ↔ a representative MIxS `seq_meth` OBI term.
 * MIxS seq_meth is one-to-many (e.g. "ILLUMINA" covers MiSeq, HiSeq, NextSeq...),
 * so the reverse direction is intrinsically lossy — we pick a sensible default.
 */
export const SRA_PLATFORM_TO_SEQ_METH: Record<string, string> = {
	ILLUMINA: 'Illumina [OBI:0000759]',
	OXFORD_NANOPORE: 'Oxford Nanopore [OBI:0002750]',
	PACBIO: 'PacBio [OBI:0001939]',
	ION_TORRENT: 'Ion Torrent [OBI:0002420]',
	LS454: '454 Genome Sequencer [OBI:0400103]',
	BGISEQ: 'BGISEQ-500 [OBI:0002767]',
	CAPILLARY: 'Sanger dye-terminator sequencing [OBI:0001931]'
};

/** Reverse index — MIxS seq_meth OBI snippet → SRA platform bucket. */
export const SEQ_METH_TO_SRA_PLATFORM: Record<string, string> = {
	Illumina: 'ILLUMINA',
	Nanopore: 'OXFORD_NANOPORE',
	MinION: 'OXFORD_NANOPORE',
	GridION: 'OXFORD_NANOPORE',
	PromethION: 'OXFORD_NANOPORE',
	PacBio: 'PACBIO',
	Sequel: 'PACBIO',
	Revio: 'PACBIO',
	'Ion Torrent': 'ION_TORRENT',
	'454': 'LS454',
	BGI: 'BGISEQ',
	Sanger: 'CAPILLARY'
};

/**
 * Translate an SRA/BioSample column name to its MIxS slot name.
 * Returns the input unchanged if no mapping exists (lets the caller decide
 * whether to drop it or route to custom_fields).
 */
export function sraToMixs(column: string): string {
	return SRA_TO_MIXS[column.toLowerCase()] ?? column;
}

/**
 * Guess an SRA `platform` value from a MIxS seq_meth string. Looks for the
 * first SEQ_METH_TO_SRA_PLATFORM key that appears in the input (case-insensitive).
 */
export function seqMethToSraPlatform(seqMeth: string | null | undefined): string | null {
	if (!seqMeth) return null;
	const lower = seqMeth.toLowerCase();
	for (const [needle, platform] of Object.entries(SEQ_METH_TO_SRA_PLATFORM)) {
		if (lower.includes(needle.toLowerCase())) return platform;
	}
	return null;
}
