/**
 * Infer the MIxS platform code from an instrument name.
 *
 * Used by /libraries/new to drop the Platform dropdown and auto-fill from
 * the selected instrument. Recognized instruments come from the
 * `seq_instrument` picklist in seed-constrained-values.ts.
 *
 * Returns null if the instrument name doesn't match a known pattern — in
 * that case the caller should fall back to 'other' or leave it unset.
 */
export function inferPlatformFromInstrument(instrument: string | null | undefined): string | null {
	if (!instrument) return null;
	const i = instrument.toLowerCase();
	if (/^illumina\b|miseq|hiseq|novaseq|nextseq|iseq/.test(i)) return 'ILLUMINA';
	if (/minion|gridion|promethion|flongle|nanopore/.test(i)) return 'OXFORD_NANOPORE';
	if (/pacbio|sequel|revio/.test(i)) return 'PACBIO';
	if (/\bion\b|genestudio|ion torrent/.test(i)) return 'ION_TORRENT';
	return null;
}

export const PLATFORM_LABEL: Record<string, string> = {
	ILLUMINA: 'Illumina',
	OXFORD_NANOPORE: 'Oxford Nanopore',
	PACBIO: 'PacBio',
	ION_TORRENT: 'Ion Torrent',
	other: 'other'
};
