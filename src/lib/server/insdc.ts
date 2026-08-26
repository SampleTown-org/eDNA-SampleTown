/**
 * INSDC metadata retrieval — SRA (NCBI), ENA (EBI), and GenBank.
 *
 * The three archives exchange records daily, so one client covers all of them:
 * the ENA Portal API serves NCBI-submitted BioProjects, BioSamples, and
 * GenBank sequence accessions under their original accessions. NCBI eutils is
 * kept as a BioSample fallback for records too new to have been mirrored.
 *
 * Records are flattened to one row per SRA run (or per sample / per sequence
 * when there are no reads) and emitted as a TSV whose headers are the column
 * names SampleTown's importer already understands. That TSV goes to
 * /api/import/mixs unchanged, so accession imports and spreadsheet uploads
 * share one validation, column-mapper, site-clustering, and insert path.
 *
 * Entity mapping (INSDC → SampleTown):
 *   BioProject  → project
 *   BioSample   → sample (+ site, from lat/lon)
 *   Experiment  → extract, pcr (amplicon only), library
 *   Run         → sequencing run
 */

import { XMLParser } from 'fast-xml-parser';
import { buildHeaderToFieldMap } from '$lib/server/mixs-io';
import { SRA_PLATFORM_TO_SEQ_METH } from '$lib/mixs/sra-mapping';

const ENA_PORTAL = 'https://www.ebi.ac.uk/ena/portal/api/filereport';
const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

/** Per-request network budget. ENA project queries with fields=all are slow. */
const FETCH_TIMEOUT_MS = 60_000;

/** Accessions accepted in one request. Each one is a separate archive query. */
export const MAX_ACCESSIONS = 25;

/** Rows returned across all accessions in one request. Matches the row cap the
 *  MIxS importer enforces, so a fetch can't build a TSV the importer rejects. */
export const MAX_ROWS = 10_000;

/** ENA Portal result set to query. Picked from the accession's shape. */
type EnaResult = 'read_run' | 'sample' | 'sequence';

export type AccessionKind =
	| 'bioproject'
	| 'study'
	| 'run'
	| 'experiment'
	| 'sample'
	| 'sequence'
	| 'unknown';

export interface InsdcFetchResult {
	/** One row per run / sample / sequence, keyed by SampleTown import column. */
	rows: Record<string, string>[];
	/** Column order for the emitted TSV. */
	headers: string[];
	/** Non-fatal problems: unmatched accessions, mirror lag, dropped rows. */
	warnings: string[];
	/** Per-accession account of what was queried and what came back. */
	resolved: { accession: string; kind: AccessionKind; source: string; rows: number }[];
}

/**
 * Classify an INSDC accession. The prefix determines which ENA result set can
 * answer for it — querying the wrong one is a 400, not an empty result.
 */
export function classifyAccession(accession: string): AccessionKind {
	const a = accession.trim().toUpperCase();
	if (/^PRJ[EDN][A-Z][0-9]+$/.test(a)) return 'bioproject';
	if (/^[EDS]RP[0-9]{6,}$/.test(a)) return 'study';
	if (/^[EDS]RR[0-9]{6,}$/.test(a)) return 'run';
	if (/^[EDS]RX[0-9]{6,}$/.test(a)) return 'experiment';
	if (/^SAM[END][A-Z]?[0-9]+$/.test(a)) return 'sample';
	if (/^[EDS]RS[0-9]{6,}$/.test(a)) return 'sample';
	// INSDC sequence accessions: 1-2 letters + 5-6 digits (GenBank/EMBL/DDBJ),
	// or the 4-letter + 2-digit + 6-8 digit WGS form. A version suffix (.1) is
	// tolerated — ENA resolves both.
	if (/^[A-Z]{1,2}[0-9]{5,6}(\.[0-9]+)?$/.test(a)) return 'sequence';
	if (/^[A-Z]{4}[0-9]{2}[0-9]{6,8}(\.[0-9]+)?$/.test(a)) return 'sequence';
	return 'unknown';
}

/** Result sets to try for a kind, in order. The first with rows wins. */
function resultsFor(kind: AccessionKind): EnaResult[] {
	switch (kind) {
		case 'bioproject':
		case 'study':
			return ['read_run', 'sample'];
		case 'run':
		case 'experiment':
			return ['read_run'];
		case 'sample':
			// Runs first: a BioSample with reads carries its whole experiment and
			// run chain, which the sample result set does not have.
			return ['read_run', 'sample'];
		case 'sequence':
			return ['sequence'];
		default:
			return ['read_run', 'sample', 'sequence'];
	}
}

async function getWithTimeout(url: string): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		return await fetch(url, {
			signal: controller.signal,
			headers: { 'User-Agent': 'SampleTown/2.0 (https://github.com/SampleTown-org/eDNA-SampleTown)' }
		});
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Query one ENA Portal result set. `fields=all` is deliberate — the archives
 * carry checklist fields we cannot enumerate ahead of time, and empty columns
 * are dropped per row on parse.
 */
async function enaQuery(accession: string, result: EnaResult): Promise<Record<string, string>[]> {
	const params = new URLSearchParams({
		accession,
		result,
		fields: 'all',
		format: 'tsv',
		limit: '0'
	});
	const res = await getWithTimeout(`${ENA_PORTAL}?${params}`);
	if (res.status === 400) return []; // accession not valid for this result set
	if (!res.ok) throw new Error(`ENA returned HTTP ${res.status} for ${accession}`);

	const text = (await res.text()).trim();
	if (!text || !text.includes('\t')) return [];

	const lines = text.split('\n');
	const headers = lines[0].split('\t').map((h) => h.trim());
	const rows: Record<string, string>[] = [];
	for (let i = 1; i < lines.length; i++) {
		const cells = lines[i].split('\t');
		const row: Record<string, string> = {};
		headers.forEach((h, j) => {
			const v = (cells[j] ?? '').trim();
			if (v) row[h] = v;
		});
		if (Object.keys(row).length > 0) rows.push(row);
	}
	return rows;
}

/** BioSample accessions per efetch call. NCBI accepts them directly as ids. */
const NCBI_BATCH = 100;

/**
 * Wall-clock backstop for the NCBI reconciliation pass.
 *
 * A batch of 100 costs roughly 0.4 s plus pacing, so even a MAX_ROWS project
 * lands near a minute — comfortably inside nginx's 300 s proxy timeout. This
 * budget exists only so a degraded NCBI cannot hang the request, not to ration
 * a normal fetch: capping by sample count silently drops metadata that is
 * cheaply available, which is the failure it replaces.
 */
const ENRICH_BUDGET_MS = 120_000;

/** Pause between NCBI calls. Without an API key NCBI asks for =< 3 requests
 *  per second; NCBI_API_KEY raises that to 10, so the wait shortens. */
function ncbiDelayMs(): number {
	return process.env.NCBI_API_KEY ? 110 : 350;
}

function ncbiAuth(): string {
	const key = process.env.NCBI_API_KEY;
	const email = process.env.NCBI_EMAIL;
	return (
		`&tool=sampletown${key ? `&api_key=${encodeURIComponent(key)}` : ''}` +
		`${email ? `&email=${encodeURIComponent(email)}` : ''}`
	);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch BioSample records from NCBI, keyed by accession.
 *
 * Rows come back in the same shape as the ENA sample result: BioSample's
 * harmonized attribute names are the same vocabulary ENA reports its checklist
 * fields under, so the caller can merge the two without translating.
 */
async function fetchNcbiBioSamples(
	accessions: string[],
	deadline?: number
): Promise<{ byAccession: Map<string, Record<string, string>>; unreached: number }> {
	const byAccession = new Map<string, Record<string, string>>();

	for (let i = 0; i < accessions.length; i += NCBI_BATCH) {
		if (deadline != null && Date.now() > deadline) {
			return { byAccession, unreached: accessions.length - i };
		}
		const batch = accessions.slice(i, i + NCBI_BATCH);
		if (i > 0) await sleep(ncbiDelayMs());

		const res = await getWithTimeout(
			`${EUTILS}/efetch.fcgi?db=biosample&id=${batch.join(',')}&rettype=full&retmode=xml${ncbiAuth()}`
		);
		if (!res.ok) throw new Error(`NCBI efetch returned HTTP ${res.status}`);

		for (const row of parseBioSampleXml(await res.text())) {
			const acc = row.sample_accession;
			if (acc) byAccession.set(acc, row);
		}
	}

	return { byAccession, unreached: 0 };
}

/** Flatten a BioSampleSet document into one row per BioSample. */
export function parseBioSampleXml(xml: string): Record<string, string>[] {
	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: '@',
		textNodeName: '#text',
		trimValues: true
	});
	const doc = parser.parse(xml) as Record<string, any>;
	const set = doc?.BioSampleSet?.BioSample;
	if (!set) return [];
	const list = Array.isArray(set) ? set : [set];

	return list.map((bs: Record<string, any>) => {
		const row: Record<string, string> = {};
		const put = (k: string, v: unknown) => {
			const s = v == null ? '' : String(typeof v === 'object' ? ((v as any)['#text'] ?? '') : v).trim();
			if (s) row[k] = s;
		};

		put('sample_accession', bs['@accession']);
		put('sample_title', bs?.Description?.Title);
		put('sample_description', bs?.Description?.Comment?.Paragraph);
		put('scientific_name', bs?.Description?.Organism?.['@taxonomy_name']);
		put('tax_id', bs?.Description?.Organism?.['@taxonomy_id']);
		put('center_name', bs?.Owner?.Name);
		put('ncbi_reporting_standard', bs?.Package?.['@display_name'] ?? bs?.Package);

		// The submitter's own sample name, carried as a labelled Id.
		const ids = bs?.Ids?.Id;
		for (const id of Array.isArray(ids) ? ids : ids ? [ids] : []) {
			if (id?.['@db_label'] === 'Sample name') put('sample_alias', id['#text'] ?? id);
			if (id?.['@db'] === 'SRA') put('secondary_sample_accession', id['#text'] ?? id);
		}

		// Harmonized attributes are BioSample's checklist columns and share
		// names with the ENA fields the normalizer maps.
		const attrs = bs?.Attributes?.Attribute;
		for (const a of Array.isArray(attrs) ? attrs : attrs ? [attrs] : []) {
			const name = a?.['@harmonized_name'] || a?.['@attribute_name'];
			if (name) put(String(name), a['#text'] ?? a);
		}
		return row;
	});
}

/**
 * INSDC column → SampleTown import column.
 *
 * Targets are the header names `buildHeaderToFieldMap()` already resolves, so
 * the importer routes them without a hand-built column map. Where an archive
 * offers several spellings of one concept they all point at the same target
 * and `pick()` takes the first populated one.
 */
const FIELD_MAP: Record<string, string> = {
	// Sample identity. sample_title is the submitter's own name for the sample
	// and the one a reader recognises; sample_alias is the submission-system
	// handle, which is often a sequencer well like "S230_2".
	sample_title: 'samp_name',
	sample_alias: 'samp_name',
	sample_description: 'notes',

	// Collection event
	collection_date: 'collection_date',
	collected_by: 'collector_name',
	country: 'geo_loc_name',
	geo_loc_name: 'geo_loc_name',
	location: 'lat_lon',
	lat_lon: 'lat_lon',
	lat: 'latitude',
	lon: 'longitude',
	sampling_site: 'site_name',
	sampling_platform: 'samp_collect_device',
	specimen_voucher: 'source_mat_id',

	// Environmental context — ENA carries both the MIxS names and its own
	// checklist spellings depending on submission vintage.
	environment_biome: 'env_broad_scale',
	broad_scale_environmental_context: 'env_broad_scale',
	env_broad_scale: 'env_broad_scale',
	environment_feature: 'env_local_scale',
	local_environmental_context: 'env_local_scale',
	env_local_scale: 'env_local_scale',
	environment_material: 'env_medium',
	environmental_medium: 'env_medium',
	env_medium: 'env_medium',
	isolation_source: 'env_medium',

	// Measurements
	depth: 'depth',
	elevation: 'elev',
	altitude: 'elev',
	temperature: 'temp',
	salinity: 'salinity',
	ph: 'ph',

	// Host
	host: 'specific_host',
	host_scientific_name: 'specific_host',
	host_tax_id: 'host_taxid',

	// Accessions carried onto the records themselves, so every row can be
	// traced back to what it was imported from without digging through tags.
	sample_accession: 'accession',
	study_accession: 'project_accession',

	// Extract (SRA experiment)
	extraction_protocol: 'nucl_acid_ext',
	scientific_name: 'samp_taxon_id',

	// Library (SRA experiment)
	library_name: 'library_name',
	library_prep_date: 'library_prep_date',
	library_source: 'library_source',
	library_selection: 'library_selection',
	library_construction_protocol: 'library_prep_kit',
	nominal_length: 'library_fragment_size_bp',
	// SampleTown's library_type is the SRA library strategy — the form labels it
	// "Library Strategy (SRA)" and the column is NOT NULL.
	library_strategy: 'library_type',
	// MIxS lib_layout; no column on library_preps, so it spills to sample_values
	// as a recognized slot rather than an opaque tag. Lower-cased below — the
	// archives shout PAIRED, the MIxS enum is lowercase.
	library_layout: 'lib_layout',

	// Run
	run_accession: 'run_name',
	run_date: 'run_date',
	instrument_platform: 'run_platform',
	instrument_model: 'run_instrument_model',
	read_count: 'run_read_count',
	fastq_ftp: 'run_fastq_dir'
};

/**
 * Archive columns that never reach the importer: download URLs, checksums,
 * byte counts, and file-role flags. They are bulky, per-file rather than
 * per-sample, and carry no scientific content.
 */
const SKIP_FIELDS = new Set([
	'fastq_ftp', 'fastq_aspera', 'fastq_galaxy', 'fastq_md5', 'fastq_bytes', 'fastq_file_role',
	'submitted_ftp', 'submitted_aspera', 'submitted_galaxy', 'submitted_md5', 'submitted_bytes',
	'submitted_file_role', 'submitted_format', 'submitted_read_type',
	'sra_ftp', 'sra_aspera', 'sra_galaxy', 'sra_md5', 'sra_bytes', 'sra_file_role',
	'bam_ftp', 'bam_aspera', 'bam_galaxy', 'bam_md5', 'bam_bytes', 'bam_file_role',
	'cram_index_ftp', 'cram_index_aspera', 'cram_index_galaxy',
	'file_location', 'datahub', 'status', 'tag'
]);

/**
 * Columns forced to `misc_param:` even though they resolve to a slot.
 *
 * `description` is archive prose that would otherwise land in a MIxS field and
 * read as curated data; `isolate` and `strain` name a culture rather than the
 * environmental sample. They are worth keeping, but
 * as tags, not as slot values.
 */
const FORCE_PROVENANCE = new Set([
	'description', 'isolate', 'strain', 'sample_description',
	'experiment_title', 'study_title', 'run_alias', 'experiment_alias',
	'sample_alias', 'study_alias', 'center_name', 'broker_name'
]);

/** Targets FIELD_MAP already claims — a pass-through column must not fight one. */
const MAPPED_TARGETS = new Set(Object.values(FIELD_MAP));

/** Resolved once: the importer's full header vocabulary (every MIxS slot,
 *  its aliases, the SRA/BioSample translations, and SampleTown's own columns). */
let headerMapCache: Record<string, string> | null = null;
function headerMap(): Record<string, string> {
	if (!headerMapCache) headerMapCache = buildHeaderToFieldMap();
	return headerMapCache;
}


/**
 * ENA checklist accession → SampleTown extension.
 *
 * ENA's GSC checklists are the MIxS environmental packages, so they name an
 * extension and say nothing about survey-vs-specimen. Three of them are whole
 * MIxS checklists instead, and those set the checklist directly.
 *
 * ERC000056 (the four food packages combined) and ERC000058 (hydrocarbon,
 * which splits into cores and fluids/swabs) are deliberately absent — they do
 * not resolve to one extension, and guessing would put samples under a
 * checklist their fields were never validated against.
 */
const ENA_CHECKLIST_TO_MIXS: Record<string, { checklist?: string; extension?: string }> = {
	ERC000012: { extension: 'Air' },
	ERC000013: { extension: 'HostAssociated' },
	ERC000014: { extension: 'HumanAssociated' },
	ERC000015: { extension: 'HumanGut' },
	ERC000016: { extension: 'HumanOral' },
	ERC000017: { extension: 'HumanSkin' },
	ERC000018: { extension: 'HumanVaginal' },
	ERC000019: { extension: 'MicrobialMatBiofilm' },
	ERC000020: { extension: 'PlantAssociated' },
	ERC000021: { extension: 'Sediment' },
	ERC000022: { extension: 'Soil' },
	ERC000023: { extension: 'WastewaterSludge' },
	ERC000024: { extension: 'Water' },
	ERC000025: { extension: 'MiscellaneousNaturalOrArtificialEnvironment' },
	ERC000031: { extension: 'BuiltEnvironment' },
	ERC000047: { checklist: 'Mimag' },
	ERC000048: { checklist: 'Misag' },
	ERC000049: { checklist: 'Miuvig' },
	ERC000055: { extension: 'Agriculture' },
	ERC000057: { extension: 'SymbiontAssociated' }
};

/** NCBI BioSample package prefix → MIxS checklist. */
const NCBI_PACKAGE_TO_CHECKLIST: Record<string, string> = {
	'MIGS.BA': 'MigsBa',
	'MIGS.EU': 'MigsEu',
	'MIGS.VI': 'MigsVi',
	'MIGS.PL': 'MigsPl',
	'MIGS.ORG': 'MigsOrg',
	'MIMARKS.SURVEY': 'MimarksS',
	'MIMARKS.SPECIMEN': 'MimarksC',
	'MIMS.ME': 'Mims',
	MIMAG: 'Mimag',
	MISAG: 'Misag',
	MIUVIG: 'Miuvig'
};

/** NCBI BioSample environmental-package suffix → MIxS extension. */
const NCBI_PACKAGE_TO_EXTENSION: Record<string, string> = {
	AIR: 'Air',
	AGRICULTURE: 'Agriculture',
	BUILT: 'BuiltEnvironment',
	'HOST-ASSOCIATED': 'HostAssociated',
	'HUMAN-ASSOCIATED': 'HumanAssociated',
	'HUMAN-GUT': 'HumanGut',
	'HUMAN-ORAL': 'HumanOral',
	'HUMAN-SKIN': 'HumanSkin',
	'HUMAN-VAGINAL': 'HumanVaginal',
	'HYDROCARBON-CORES': 'HydrocarbonResourcesCores',
	'HYDROCARBON-FLUIDS-SWABS': 'HydrocarbonResourcesFluidsSwabs',
	MICROBIAL: 'MicrobialMatBiofilm',
	MISCELLANEOUS: 'MiscellaneousNaturalOrArtificialEnvironment',
	'PLANT-ASSOCIATED': 'PlantAssociated',
	SEDIMENT: 'Sediment',
	SOIL: 'Soil',
	'SYMBIONT-ASSOCIATED': 'SymbiontAssociated',
	WASTEWATER: 'WastewaterSludge',
	WATER: 'Water',
	'FOOD-ANIMAL-AND-ANIMAL-FEED': 'FoodAnimalAndAnimalFeed',
	'FOOD-FARM-ENVIRONMENT': 'FoodFarmEnvironment',
	'FOOD-PRODUCTION-FACILITY': 'FoodFoodProductionFacility',
	'FOOD-HUMAN-FOODS': 'FoodHumanFoods'
};

/**
 * Read the MIxS checklist and environmental package the submitter declared.
 *
 * A record that says it is MIMARKS survey water should be validated as
 * MIMARKS survey water, not as whatever the import form happened to be set to.
 * Anything undeclared is left unset so the form default still applies.
 */
export function resolveChecklist(raw: Record<string, string>): {
	checklist?: string;
	extension?: string;
} {
	const out: { checklist?: string; extension?: string } = {};

	// NCBI states both halves: "MIMARKS.survey.water.6.0" → MimarksS + Water.
	const pkg = (raw.ncbi_reporting_standard || '').trim().toUpperCase();
	if (pkg) {
		// Strip the trailing version ("6.0") so the env package is the last part.
		const parts = pkg.replace(/\.[0-9]+(\.[0-9]+)*$/, '').split('.');
		for (let take = Math.min(2, parts.length); take >= 1; take--) {
			const prefix = parts.slice(0, take).join('.');
			const checklist = NCBI_PACKAGE_TO_CHECKLIST[prefix];
			if (checklist) {
				out.checklist = checklist;
				const suffix = parts.slice(take).join('.');
				if (suffix) out.extension = NCBI_PACKAGE_TO_EXTENSION[suffix];
				break;
			}
		}
	}

	// ENA states the environmental package, and occasionally the checklist.
	const erc = (raw.checklist || '').trim().toUpperCase();
	if (erc) {
		const hit = ENA_CHECKLIST_TO_MIXS[erc];
		if (hit) {
			if (hit.checklist && !out.checklist) out.checklist = hit.checklist;
			if (hit.extension && !out.extension) out.extension = hit.extension;
		}
	}

	return out;
}

/**
 * INSDC placeholders for "no value". Merging one of these over a blank would
 * dress an absent field up as a recorded one in the preview; the importer
 * nulls them at parse time either way.
 */
const NULL_PLACEHOLDERS = new Set([
	'not collected', 'not applicable', 'not provided', 'missing',
	'unknown', 'none', 'n/a', 'na', 'null', '-'
]);

function isPlaceholder(value: string): boolean {
	return NULL_PLACEHOLDERS.has(value.trim().toLowerCase());
}

/** First non-empty value among `keys`. */
function pick(row: Record<string, string>, ...keys: string[]): string {
	for (const k of keys) {
		const v = row[k];
		if (v && v.trim()) return v.trim();
	}
	return '';
}

/** Values must survive a tab-separated, newline-delimited round trip. */
function clean(value: string): string {
	return value.replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Turn one archive record into a SampleTown import row.
 *
 * `kind` decides how much of the downstream chain is materialized: a run
 * record describes an experiment and a run, a bare sample or sequence record
 * describes neither, and asking the importer to create empty extracts and
 * libraries for those would fabricate lab work that never happened.
 */
function normalizeRow(raw: Record<string, string>, result: EnaResult): Record<string, string> {
	const out: Record<string, string> = {};
	const set = (k: string, v: string) => {
		const c = clean(v);
		if (c) out[k] = c;
	};

	for (const [source, target] of Object.entries(FIELD_MAP)) {
		if (out[target]) continue; // earlier spelling already won
		const v = raw[source];
		if (v) set(target, v);
	}

	// samp_name is the importer's row key and its uniqueness constraint. The
	// submitter's alias is the most meaningful name; accessions are the
	// guaranteed-unique fallback.
	if (!out.samp_name) {
		set(
			'samp_name',
			pick(raw, 'sample_title', 'sample_alias', 'sample_accession', 'run_accession', 'accession')
		);
	}

	// ENA reports a MIxS-shaped `location` only when the submitter gave one;
	// otherwise lat/lon are separate and parseMixsTsv composes them.
	if (!out.lat_lon) {
		const loc = pick(raw, 'location_start', 'location_end');
		if (loc) set('lat_lon', loc);
	}

	// A collection_date range collapses to its start — MIxS takes one value,
	// and the range endpoints ride along as provenance.
	if (!out.collection_date) {
		set('collection_date', pick(raw, 'collection_date_start', 'collection_date_end'));
	}

	// samp_taxon_id wants the organism together with its NCBI taxid.
	const taxName = pick(raw, 'scientific_name', 'organism');
	const taxId = pick(raw, 'tax_id');
	if (taxName && taxId) set('samp_taxon_id', `${taxName} (NCBI:txid${taxId})`);

	// BioProject → project. The study title is the BioProject's human-readable
	// name and the only field that reads as a project in the UI. ENA's own
	// `project_name` column is a registration field submitters often fill with
	// the organism, so it ranks below the title and above the bare accession.
	// The accession itself travels on the project's `accession` column, not in
	// its name.
	if (!out.project_name) {
		set(
			'project_name',
			pick(raw, 'study_title', 'project_name', 'study_accession', 'secondary_study_accession')
		);
	}

	if (result === 'read_run') {
		// Experiment → extract. SRA has no extraction record of its own, so one
		// extract per sample stands in for the material the library was built
		// from; the importer reuses it across a sample's several runs.
		set('extract_name', `${out.samp_name}_ext`);

		// Experiment → PCR, but only for amplicon libraries. Recording a PCR for
		// a shotgun metagenome would assert an amplification that did not happen.
		const strategy = pick(raw, 'library_strategy').toUpperCase();
		const selection = pick(raw, 'library_selection').toUpperCase();
		const targetGene = pick(raw, 'target_gene', 'taxonomic_identity_marker');
		// An SRA experiment is one library prep on one sample, sequenced in one or
		// more runs, so the experiment accession names both the reaction and the
		// library. Runs sharing an experiment then resolve to a single library
		// rather than one apiece.
		const experiment = pick(raw, 'experiment_accession');
		if (experiment) {
			set('pcr_accession', experiment);
			set('library_accession', experiment);
		}
		set('run_accession_id', pick(raw, 'run_accession'));
		// A submission is the batch the experiments arrived in — the closest
		// thing the archives carry to "these were processed together", so it
		// names the plate they are laid out on.
		const submission = pick(raw, 'submission_accession');

		if (strategy === 'AMPLICON' || selection === 'PCR' || targetGene) {
			set('pcr_name', experiment ? `${experiment}_pcr` : `${out.samp_name}_pcr`);
			set('pcr_cond', pick(raw, 'pcr_isolation_protocol', 'library_pcr_isolation_protocol'));
			if (targetGene) set('target_gene', targetGene);
			set('pcr_notes', pick(raw, 'library_construction_protocol'));
			if (submission) set('pcr_plate_name', `${submission}_pcr`);
		}

		// Experiment → library, named by its accession. ENA's library_name is the
		// submitter's free text and is frequently "unspecified" or a plate well,
		// neither of which identifies the library outside its own submission.
		out.library_name = experiment || clean(pick(raw, 'library_name')) || `${out.samp_name}_lib`;
		if (out.library_name.toLowerCase() === 'unspecified') out.library_name = `${out.samp_name}_lib`;
		if (submission) set('library_plate_name', `${submission}_lib`);
		set('library_platform', pick(raw, 'instrument_platform'));
		set('library_instrument_model', pick(raw, 'instrument_model'));

		// MIxS seq_meth wants an OBI term; the archives report the coarse SRA
		// platform enum. sra-mapping.ts already holds that translation for the
		// export side, and MimarksS requires the slot.
		const seqMeth = SRA_PLATFORM_TO_SEQ_METH[pick(raw, 'instrument_platform').toUpperCase()];
		if (seqMeth) set('seq_meth', seqMeth);

		if (out.lib_layout) out.lib_layout = out.lib_layout.toLowerCase();

		// Run → sequencing run. One SRA run is one sequencing event, so each
		// becomes its own run record; the importer dedupes them by name.
		const bases = Number(pick(raw, 'base_count'));
		if (Number.isFinite(bases) && bases > 0) {
			set('run_total_bases_gb', String(bases / 1e9));
		}
		if (!out.run_date) set('run_date', pick(raw, 'first_created', 'first_public'));
		// fastq_ftp is a semicolon-joined pair for paired runs; the link row
		// stores the directory they share.
		const fastq = pick(raw, 'fastq_ftp');
		if (fastq) {
			const first = fastq.split(';')[0];
			const dir = first.includes('/') ? first.slice(0, first.lastIndexOf('/')) : first;
			set('run_fastq_dir', dir);
		}
	}

	// The declared checklist decides which MIxS combination class the row is
	// validated against, so MIMARKS records arrive as MIMARKS.
	const declared = resolveChecklist(raw);
	if (declared.checklist) set('mixs_checklist', declared.checklist);
	if (declared.extension) set('extension', declared.extension);

	// Everything FIELD_MAP didn't claim. ENA returns whichever checklist fields
	// the submitter filled, and we cannot enumerate them ahead of time — so each
	// one is offered to the importer's own header vocabulary, which knows every
	// MIxS slot and its aliases. Whatever that does not recognize is kept as a
	// misc_param tag rather than dropped, and the column mapper gives the user
	// the final say over both.
	const map = headerMap();
	const claimed = new Set(MAPPED_TARGETS);
	for (const key of Object.keys(raw).sort()) {
		if (key in FIELD_MAP || SKIP_FIELDS.has(key) || key in out) continue;
		const value = raw[key];
		if (!value) continue;

		const target = map[key.toLowerCase()];
		if (target && !FORCE_PROVENANCE.has(key)) {
			if (!claimed.has(target)) {
				// Emit under the archive's own column name so the mapper shows the
				// user the field they'd recognize from the submission.
				set(key, value);
				claimed.add(target);
				continue;
			}
			// The target is spoken for but empty on this row, which means the two
			// spellings are the same measurement reported different ways. ENA
			// exposes `temperature` and the GSC checklists a bare `temp`, and both
			// resolve to the MIxS `temp` slot; demoting the loser stranded 144 of
			// PRJNA421293's temperatures in a misc_param tag while the rest sat in
			// the slot. Fill the slot instead.
			if (!out[target]) {
				set(target, value);
				continue;
			}
		}
		set(`misc_param:${key}`, value);
	}

	return out;
}

/** Escape one TSV cell. Blank stays blank — the importer reads it as null. */
function tsvCell(value: string | undefined): string {
	if (!value) return '';
	const s = clean(value);
	return /[\t"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Render fetched rows as a TSV for /api/import/mixs. Column order puts the
 * fields a reviewer checks first — name, date, place — ahead of the long tail.
 */
export function rowsToTsv(rows: Record<string, string>[], headers: string[]): string {
	const lines = [headers.join('\t')];
	for (const row of rows) {
		lines.push(headers.map((h) => tsvCell(row[h])).join('\t'));
	}
	return lines.join('\n');
}

const HEADER_ORDER = [
	'samp_name', 'accession', 'project_name', 'project_accession',
	'mixs_checklist', 'extension',
	'collection_date', 'site_name', 'lat_lon',
	'latitude', 'longitude', 'geo_loc_name', 'env_broad_scale', 'env_local_scale',
	'env_medium', 'depth', 'elev', 'temp', 'salinity', 'ph', 'specific_host',
	'host_taxid', 'samp_taxon_id', 'samp_collect_device', 'source_mat_id',
	'collector_name', 'notes',
	'extract_name', 'nucl_acid_ext',
	'pcr_name', 'pcr_accession', 'pcr_plate_name', 'pcr_cond', 'target_gene', 'pcr_notes',
	'library_plate_name',
	'library_name', 'library_accession', 'library_type', 'library_prep_date', 'library_prep_kit',
	'library_platform', 'library_instrument_model', 'library_source',
	'library_selection', 'lib_layout', 'library_fragment_size_bp',
	'seq_meth', 'run_name', 'run_accession_id', 'run_date', 'run_platform', 'run_instrument_model',
	'run_read_count', 'run_total_bases_gb', 'run_fastq_dir'
];

/** Union of the columns present, in HEADER_ORDER first, then misc_param tags. */
function collectHeaders(rows: Record<string, string>[]): string[] {
	const present = new Set<string>();
	for (const row of rows) for (const k of Object.keys(row)) present.add(k);

	const headers = HEADER_ORDER.filter((h) => present.has(h));
	const rest = Array.from(present).filter((h) => !HEADER_ORDER.includes(h)).sort();
	return [...headers, ...rest];
}

/**
 * Fetch metadata for a list of accessions and normalize it into importer rows.
 *
 * Accessions are queried one at a time: they resolve to different result sets,
 * and one bad accession should cost a warning rather than the whole request.
 */
export async function fetchInsdc(accessions: string[]): Promise<InsdcFetchResult> {
	const warnings: string[] = [];
	const resolved: InsdcFetchResult['resolved'] = [];
	const rows: Record<string, string>[] = [];
	let truncated = false;

	for (const accession of accessions) {
		const kind = classifyAccession(accession);
		if (kind === 'unknown') {
			warnings.push(`${accession}: not a recognized INSDC accession — skipped`);
			resolved.push({ accession, kind, source: 'none', rows: 0 });
			continue;
		}

		let raw: Record<string, string>[] = [];
		let source = '';
		// Which result set answered. Kept separate from the human-readable
		// `source` string, which gains suffixes as the record is enriched.
		let answered: EnaResult | null = null;
		try {
			for (const result of resultsFor(kind)) {
				raw = await enaQuery(accession, result);
				if (raw.length > 0) {
					source = `ENA ${result}`;
					answered = result;
					break;
				}
			}
		} catch (err) {
			warnings.push(`${accession}: ${err instanceof Error ? err.message : String(err)}`);
			resolved.push({ accession, kind, source: 'error', rows: 0 });
			continue;
		}

		// ENA mirrors NCBI on a daily cycle, so a BioSample submitted today is
		// findable at NCBI and nowhere else.
		if (raw.length === 0 && (kind === 'sample' || kind === 'bioproject' || kind === 'study')) {
			try {
				const direct = await fetchNcbiBioSamples([accession]);
				raw = Array.from(direct.byAccession.values());
				if (raw.length > 0) {
					source = 'NCBI biosample';
					answered = 'sample';
				}
			} catch (err) {
				warnings.push(
					`${accession}: NCBI fallback failed (${err instanceof Error ? err.message : String(err)})`
				);
			}
		}

		// BioSample is the authority on what a sample is; ENA holds a copy, and
		// the copy is not always complete. ENA indexes a submission's runs before
		// it ingests the BioSamples they point at — a gap that can outlast the
		// daily mirror and leaves run rows carrying no date, coordinates, or
		// environmental context at all. Short of that, ENA's row can simply omit
		// fields BioSample records.
		//
		// So every run row is reconciled against its BioSample rather than only
		// the visibly empty ones: one batched request per 100 samples buys
		// metadata that is otherwise silently missing. ENA still wins every field
		// it has a value for; NCBI only fills blanks.
		if (raw.length > 0 && answered === 'read_run') {
			const withBioSample = raw.filter((r) => r.sample_accession);
			const wanted = Array.from(
				new Set(withBioSample.map((r) => r.sample_accession).filter((a): a is string => !!a))
			);

			if (wanted.length > 0) {
				try {
					const { byAccession, unreached } = await fetchNcbiBioSamples(
						wanted,
						Date.now() + ENRICH_BUDGET_MS
					);

					for (const row of withBioSample) {
						const bs = row.sample_accession ? byAccession.get(row.sample_accession) : undefined;
						if (!bs) continue;
						for (const [k, v] of Object.entries(bs)) {
							// ENA's value wins where it has one; NCBI only fills blanks.
							if (v && !isPlaceholder(v) && !row[k]) row[k] = v;
						}
					}

					// The `resolved` table already reports NCBI as a source; a
					// routine reconciliation needs no warning of its own.
					if (byAccession.size > 0) source += ' + NCBI biosample';
					if (unreached > 0) {
						warnings.push(
							`${accession}: ran out of time reconciling against NCBI with ${unreached} of ${wanted.length} sample(s) left. Those records keep whatever ENA had, so some may be missing coordinates — re-run the fetch to pick them up.`
						);
					}
				} catch (err) {
					warnings.push(
						`${accession}: could not reconcile against NCBI BioSample (${err instanceof Error ? err.message : String(err)}); keeping ENA's metadata.`
					);
				}
			}
		}

		if (raw.length === 0) {
			warnings.push(
				`${accession}: no records found. Submissions can take a day to reach ENA — if this is a brand-new NCBI accession, try again tomorrow.`
			);
			resolved.push({ accession, kind, source: source || 'none', rows: 0 });
			continue;
		}

		const result: EnaResult = answered ?? 'sample';

		let kept = 0;
		for (const r of raw) {
			if (rows.length >= MAX_ROWS) {
				truncated = true;
				break;
			}
			const normalized = normalizeRow(r, result);
			if (normalized.samp_name) {
				rows.push(normalized);
				kept++;
			}
		}
		resolved.push({ accession, kind, source, rows: kept });
		if (truncated) break;
	}

	if (truncated) {
		warnings.push(`Stopped at ${MAX_ROWS} rows — import these, then fetch the rest.`);
	}

	// samp_name has to identify one BioSample, because the importer keys samples
	// on (project, samp_name): two BioSamples sharing a name become one sample,
	// silently, taking their runs and extracts with them.
	//
	// A title does not guarantee that. NCBI writes one for submitters who left
	// it blank — "MIMARKS Survey related sample from marine metagenome" covers
	// 472 distinct BioSamples in PRJNA421293 alone. Where a name spans more than
	// one accession it is replaced by the accession, which is the only field
	// that is unique by construction; the title is kept as a tag so nothing is
	// lost. Rows sharing an accession keep sharing a name — those are several
	// runs of one sample, which is exactly the case the keying is meant to
	// collapse.
	const accessionsByName = new Map<string, Set<string>>();
	for (const row of rows) {
		const key = row.accession ?? row.samp_name;
		if (!row.samp_name) continue;
		const set = accessionsByName.get(row.samp_name) ?? new Set<string>();
		set.add(key);
		accessionsByName.set(row.samp_name, set);
	}

	let renamed = 0;
	for (const row of rows) {
		const shared = accessionsByName.get(row.samp_name);
		if (!shared || shared.size < 2 || !row.accession) continue;
		if (!row['misc_param:sample_title']) row['misc_param:sample_title'] = row.samp_name;
		row.samp_name = row.accession;
		renamed++;
	}
	if (renamed > 0) {
		warnings.push(
			`${renamed} record(s) share a sample title with a different BioSample, so they are named by accession instead. The title is kept as misc_param:sample_title.`
		);
	}

	return { rows, headers: collectHeaders(rows), warnings, resolved };
}
