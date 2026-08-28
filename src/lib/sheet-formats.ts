/**
 * The sheet layouts SampleTown can emit, for export and as empty templates.
 *
 * A format decides two things: which columns a sheet carries, and what one row
 * of it stands for. MIxS describes a sample, so its rows are samples. The SRA
 * submission sheet describes a sequencing library, so a sample sequenced three
 * times occupies three rows. Mixing the two would misreport both.
 *
 * Client-safe: the export and template pickers name these, and the server
 * builds from the same list.
 */

export type SheetFormat = 'mixs' | 'sra' | 'sampletown' | 'all';

export interface SheetFormatInfo {
	value: SheetFormat;
	label: string;
	/** What one row of this sheet stands for. */
	grain: 'sample' | 'library';
	description: string;
	/** Whether the checklist/extension pickers apply — only MIxS columns come
	 *  from a combination class. */
	usesChecklist: boolean;
	/**
	 * Whether the sheet carries the second header row naming each column's
	 * vocabulary.
	 *
	 * It is a SampleTown convention: useful on a sheet coming back to us, and
	 * fatal on one going to an archive, where row two is read as the first
	 * record. The submission formats therefore go without it. The importer
	 * strips the row when it is there and does not miss it when it is not, so
	 * either shape reads back.
	 */
	vocabularyRow: boolean;
}

export const SHEET_FORMATS: SheetFormatInfo[] = [
	{
		value: 'mixs',
		label: 'MIxS / BioSample',
		grain: 'sample',
		description:
			'Sample metadata for the chosen checklist and extension. This is the sheet NCBI BioSample and ENA take.',
		usesChecklist: true,
		vocabularyRow: false
	},
	{
		value: 'sra',
		label: 'SRA submission',
		grain: 'library',
		description:
			"The columns of NCBI's own SRA_metadata template — one row per sequencing library, naming its read files.",
		usesChecklist: false,
		vocabularyRow: false
	},
	{
		value: 'sampletown',
		label: 'SampleTown',
		grain: 'library',
		description:
			"SampleTown's own columns across the whole chain — site, extract, PCR, library and run. Not a standard; what the app records and can read back.",
		usesChecklist: false,
		vocabularyRow: true
	},
	{
		value: 'all',
		label: 'Everything',
		grain: 'library',
		description:
			'Every column of the three above together, for an archive copy or for working out where something is recorded.',
		usesChecklist: true,
		vocabularyRow: true
	}
];

export function sheetFormat(value: string | null | undefined): SheetFormatInfo {
	return SHEET_FORMATS.find((f) => f.value === value) ?? SHEET_FORMATS[0];
}
