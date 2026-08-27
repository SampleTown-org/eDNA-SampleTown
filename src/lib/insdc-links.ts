/**
 * Where an INSDC accession lives on the web.
 *
 * The archives mirror each other, so most accessions resolve at either NCBI or
 * ENA. NCBI is used throughout for one reason: it is the only one of the two
 * that resolves every kind SampleTown stores, including submissions, so a
 * reader learns one address bar rather than two.
 *
 * Client-safe: the tables and detail pages link accessions, and the server
 * classifies them with the same rules.
 */

export type InsdcKind =
	| 'bioproject'
	| 'study'
	| 'run'
	| 'experiment'
	| 'sample'
	| 'submission'
	| 'sequence';

/**
 * What kind of record an accession names, by its prefix.
 *
 * Returns null for anything unrecognized — a hand-entered identifier, a local
 * lab code — which is the signal not to link it anywhere.
 */
export function insdcKind(accession: string | null | undefined): InsdcKind | null {
	if (!accession) return null;
	const a = String(accession).trim().toUpperCase();
	if (/^PRJ[EDN][A-Z][0-9]+$/.test(a)) return 'bioproject';
	if (/^[EDS]RP[0-9]{6,}$/.test(a)) return 'study';
	if (/^[EDS]RR[0-9]{6,}$/.test(a)) return 'run';
	if (/^[EDS]RX[0-9]{6,}$/.test(a)) return 'experiment';
	if (/^[EDS]RA[0-9]{6,}$/.test(a)) return 'submission';
	if (/^SAM[END][A-Z]?[0-9]+$/.test(a)) return 'sample';
	if (/^[EDS]RS[0-9]{6,}$/.test(a)) return 'sample';
	// INSDC sequence accessions: 1-2 letters + 5-6 digits (GenBank/EMBL/DDBJ),
	// or the 4-letter + 2-digit + 6-8 digit WGS form. A version suffix (.1) is
	// tolerated — both archives resolve either.
	if (/^[A-Z]{1,2}[0-9]{5,6}(\.[0-9]+)?$/.test(a)) return 'sequence';
	if (/^[A-Z]{4}[0-9]{2}[0-9]{6,8}(\.[0-9]+)?$/.test(a)) return 'sequence';
	return null;
}

/**
 * The public record for an accession, or null when it is not one.
 *
 * Runs and studies live in the Trace browser rather than under www, and a
 * submission has no page of its own — it resolves to the runs it delivered,
 * which is what a submission means to a reader looking one up.
 */
export function insdcUrl(accession: string | null | undefined): string | null {
	const kind = insdcKind(accession);
	if (!kind) return null;
	const acc = encodeURIComponent(String(accession).trim());
	switch (kind) {
		case 'bioproject':
			return `https://www.ncbi.nlm.nih.gov/bioproject/${acc}`;
		case 'sample':
			return `https://www.ncbi.nlm.nih.gov/biosample/${acc}`;
		case 'experiment':
			return `https://www.ncbi.nlm.nih.gov/sra/${acc}`;
		case 'submission':
			return `https://www.ncbi.nlm.nih.gov/sra/?term=${acc}`;
		case 'study':
			return `https://trace.ncbi.nlm.nih.gov/Traces/?view=study&acc=${acc}`;
		case 'run':
			return `https://trace.ncbi.nlm.nih.gov/Traces/index.html?view=run_browser&acc=${acc}`;
		case 'sequence':
			return `https://www.ncbi.nlm.nih.gov/nuccore/${acc}`;
	}
}

/** What the link points at, for a title attribute: "BioProject at NCBI". */
export function insdcLabel(accession: string | null | undefined): string | null {
	const kind = insdcKind(accession);
	if (!kind) return null;
	const names: Record<InsdcKind, string> = {
		bioproject: 'BioProject',
		study: 'SRA study',
		run: 'SRA run',
		experiment: 'SRA experiment',
		sample: 'BioSample',
		submission: 'SRA submission',
		sequence: 'GenBank record'
	};
	return `${names[kind]} at NCBI`;
}
