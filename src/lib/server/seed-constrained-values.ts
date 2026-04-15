import type Database from 'better-sqlite3';

/**
 * Picklist seed data. Each entry is either a bare string (value == label)
 * or a `{value, label}` pair when the canonical value needs a friendlier
 * display label. The `{value, label}` form is used for categories like
 * `seq_platform` whose values must match an SRA/INSDC-mandated string,
 * and for categories like `library_type` where the canonical underscore
 * form is ugly but well-established.
 */
type SeedEntry = string | { value: string; label: string };

const SEED_DATA: Record<string, SeedEntry[]> = {
	pipeline: [
		'danaseq', 'microscape-nf', 'custom'
	],
	person_role: [
		'collector',
		'co-collector',
		'extractor',
		'pcr operator',
		'library prep',
		'sequencer operator',
		'supervisor',
		'observer',
		'field tech',
		'lab tech',
		'student',
		'analyst',
		// Lab-position roles — used for Personnel records + attribution.
		'PI', 'Co-PI', 'Lab Manager', 'Postdoc',
		'PhD Student', 'MSc Student', 'Undergrad',
		'Bioinformatician', 'Collaborator', 'Other'
	],
	geo_loc_name: [
		'Canada: British Columbia', 'Canada: Alberta', 'Canada: Ontario', 'Canada: Quebec',
		'Canada: Nova Scotia', 'Canada: Newfoundland', 'Canada: Arctic',
		'USA: Alaska', 'USA: Washington', 'USA: Oregon', 'USA: California', 'USA: Hawaii',
		'USA: Maine', 'USA: Florida',
		'Norway', 'Iceland', 'Greenland', 'Sweden', 'Finland', 'Denmark',
		'United Kingdom', 'France', 'Germany', 'Japan', 'Australia', 'New Zealand',
		'Antarctica', 'Arctic Ocean', 'Atlantic Ocean', 'Pacific Ocean'
	],
	locality: [
		'Burrard Inlet', 'Strait of Georgia', 'Juan de Fuca Strait',
		'Puget Sound', 'Hecate Strait', 'Dixon Entrance',
		'Bamfield', 'Haida Gwaii', 'Quadra Island', 'Calvert Island'
	],
	env_broad_scale: [
		'marine biome [ENVO:00000447]', 'freshwater biome [ENVO:00000873]',
		'terrestrial biome [ENVO:00000446]', 'coastal biome [ENVO:01000228]',
		'ocean biome [ENVO:01000048]', 'aquatic biome [ENVO:01000030]',
		'estuary biome [ENVO:00000872]', 'freshwater lake biome [ENVO:01000253]',
		'freshwater river biome [ENVO:01000254]', 'forest biome [ENVO:01000174]',
		'tundra biome [ENVO:01000180]', 'mangrove biome [ENVO:01000181]',
		'desert biome [ENVO:01000179]', 'grassland biome [ENVO:01000177]'
	],
	env_local_scale: [
		'ocean [ENVO:00000015]', 'sea [ENVO:00000016]', 'lake [ENVO:00000020]',
		'river [ENVO:00000022]', 'pond [ENVO:00000033]', 'fjord [ENVO:00000039]',
		'estuary [ENVO:00000045]', 'beach [ENVO:00000054]', 'reef [ENVO:00000138]',
		'bay [ENVO:00000233]', 'harbour [ENVO:00000317]', 'coastal water [ENVO:00002150]',
		'wetland [ENVO:00000043]', 'spring [ENVO:00000027]',
		'forest floor [ENVO:00002006]', 'agricultural field [ENVO:00000114]'
	],
	env_medium: [
		'sea water [ENVO:00002149]', 'fresh water [ENVO:00002011]',
		'water [ENVO:00002006]', 'sediment [ENVO:00002007]', 'soil [ENVO:00001998]',
		'air [ENVO:00002005]', 'mud [ENVO:00005774]', 'sand [ENVO:00002008]',
		'surface water [ENVO:00002042]', 'ground water [ENVO:00002041]',
		'biofilm [ENVO:00005792]', 'saline water [ENVO:00002010]',
		'brackish water [ENVO:00002043]', 'porewater [ENVO:00005791]'
	],
	filter_type: [
		'Sterivex 0.22 µm', 'Sterivex 0.45 µm', 'Sterivex 0.1 µm',
		'GF/F 0.7 µm', 'MCE 0.22 µm', 'MCE 0.45 µm', 'PC 0.2 µm', 'PC 0.4 µm',
		'Whatman GF/C', 'Whatman GF/F', 'Nylon 0.22 µm', 'PVDF 0.22 µm',
		'Cellulose nitrate 0.22 µm', 'Glass fiber', 'None (grab sample)'
	],
	samp_store_sol: [
		'Ethanol (95%)', 'Ethanol (70%)', 'RNAlater', 'Longmire buffer',
		'CTAB buffer', 'Flash frozen (LN₂)', 'Frozen (-20°C)', 'Frozen (-80°C)',
		'Silica desiccant', 'DMSO-EDTA salt', 'Formaldehyde', 'Lugol\'s iodine',
		'None (processed immediately)'
	],
	// samp_store_temp is numeric (°C) in MIxS 6.3 — so no picklist needed;
	// removed the old `storage_conditions` enum.
	samp_collect_device: [
		'Niskin bottle', 'Go-Flo bottle', 'CTD rosette',
		'grab sampler', 'push core', 'box core', 'gravity core',
		'peristaltic pump', 'bucket', 'syringe', 'Van Dorn bottle',
		'sterile swab', 'scoop', 'tweezers', 'other'
	],
	samp_collect_method: [
		'filtration', 'grab sample', 'pumped', 'corer', 'swab',
		'net tow', 'sediment trap', 'bulk sample', 'scraping', 'other'
	],
	samp_store_temp: [
		'-196 degree Celsius', '-80 degree Celsius', '-20 degree Celsius',
		'4 degree Celsius', 'room temperature', 'ambient'
	],
	samp_store_loc: [
		'-80 freezer', '-20 freezer', 'LN₂ dewar', '4°C fridge',
		'bench (room temp)', 'ship cold room', 'desiccator cabinet'
	],
	store_cond: [
		'frozen', 'refrigerated', 'room temperature', 'desiccated',
		'in RNAlater', 'in ethanol', 'dry', 'dark', 'light-exposed'
	],
	// Extraction methods + kits merged into one picklist (was previously
	// split into extraction_method + nucl_acid_ext_kit — redundant).
	extraction_method: [
		'Column-based', 'Phenol-chloroform', 'Bead-beating + column',
		'Magnetic bead', 'CTAB', 'Chelex', 'Direct PCR (no extraction)',
		'Qiagen DNeasy Blood & Tissue', 'Qiagen DNeasy PowerSoil Pro',
		'Qiagen DNeasy PowerWater', 'Qiagen DNeasy PowerMax Soil',
		'Zymo Quick-DNA Miniprep', 'Zymo Quick-DNA/RNA MagBead',
		'Zymo DNA/RNA Shield', 'MN NucleoSpin Soil',
		'Promega Wizard Genomic', 'Invitrogen PureLink Genomic',
		'Omega Bio-tek E.Z.N.A. Soil', 'MP Bio FastDNA SPIN',
		'Macherey-Nagel NucleoMag', 'Thermo MagMAX',
		'Manual phenol-chloroform', 'Other'
	],
	polymerase: [
		'Phusion High-Fidelity', 'Q5 High-Fidelity', 'KAPA HiFi HotStart',
		'Platinum Taq', 'AmpliTaq Gold', 'GoTaq', 'DreamTaq',
		'Phire II Hot Start', 'PrimeSTAR GXL', 'AccuPrime Pfx',
		'EconoTaq PLUS', 'OneTaq', 'Other'
	],
	library_prep_kit: [
		'NEBNext Ultra II DNA', 'NEBNext Ultra II FS DNA', 'NEBNext Quick Ligation',
		'KAPA HyperPlus', 'KAPA HyperPrep', 'Nextera XT', 'Nextera DNA Flex',
		'Illumina DNA Prep', 'Illumina Stranded mRNA',
		'ONT Ligation Sequencing (SQK-LSK114)', 'ONT Rapid Barcoding (SQK-RBK114)',
		'ONT Native Barcoding (SQK-NBD114)', 'ONT 16S Barcoding (SQK-16S114)',
		'SMRTbell prep kit 3.0', 'Other'
	],
	storage_room: [
		'-80°C Freezer A', '-80°C Freezer B', '-20°C Freezer',
		'4°C Fridge', 'LN₂ Dewar', 'Room temp shelf', 'Field cooler'
	],
	storage_box: [
		'Box 1', 'Box 2', 'Box 3', 'Box 4', 'Box 5',
		'Box 6', 'Box 7', 'Box 8', 'Box 9', 'Box 10',
		'Rack A', 'Rack B', 'Rack C'
	],
	// Values must match the schema CHECK constraint on sequencing_runs.platform
	// (ILLUMINA / OXFORD_NANOPORE / PACBIO / ION_TORRENT) — labels are the
	// friendly form shown in the dropdown.
	seq_platform: [
		{ value: 'ILLUMINA', label: 'Illumina' },
		{ value: 'OXFORD_NANOPORE', label: 'Oxford Nanopore' },
		{ value: 'PACBIO', label: 'PacBio' },
		{ value: 'ION_TORRENT', label: 'Ion Torrent' }
	],
	seq_instrument: [
		'Illumina MiSeq', 'Illumina HiSeq 2500', 'Illumina HiSeq 4000',
		'Illumina NovaSeq 6000', 'Illumina NextSeq 500', 'Illumina NextSeq 2000', 'Illumina iSeq 100',
		'MinION', 'GridION', 'PromethION', 'Flongle',
		'PacBio Sequel', 'PacBio Sequel II', 'PacBio Sequel IIe', 'PacBio Revio',
		'Ion GeneStudio S5', 'Ion Torrent PGM', 'Ion Torrent Proton'
	],
	// SRA controlled vocabulary — exact values from NCBI SRA_metadata.xlsx
	library_strategy: [
		{ value: 'AMPLICON', label: 'Amplicon' },
		{ value: 'WGS', label: 'Whole Genome Sequencing' },
		{ value: 'WGA', label: 'Whole Genome Amplification' },
		{ value: 'RNA-Seq', label: 'RNA-Seq' },
		{ value: 'miRNA-Seq', label: 'miRNA-Seq' },
		{ value: 'WXS', label: 'Whole Exome' },
		{ value: 'Targeted-Capture', label: 'Targeted Capture' },
		{ value: 'Bisulfite-Seq', label: 'Bisulfite-Seq' },
		{ value: 'RAD-Seq', label: 'RAD-Seq' },
		{ value: 'OTHER', label: 'Other' }
	],
	library_source: [
		{ value: 'GENOMIC', label: 'Genomic DNA' },
		{ value: 'TRANSCRIPTOMIC', label: 'Transcriptomic' },
		{ value: 'METAGENOMIC', label: 'Metagenomic' },
		{ value: 'METATRANSCRIPTOMIC', label: 'Metatranscriptomic' },
		{ value: 'SYNTHETIC', label: 'Synthetic' },
		{ value: 'VIRAL RNA', label: 'Viral RNA' },
		{ value: 'GENOMIC SINGLE CELL', label: 'Genomic Single Cell' },
		{ value: 'TRANSCRIPTOMIC SINGLE CELL', label: 'Transcriptomic Single Cell' },
		{ value: 'OTHER', label: 'Other' }
	],
	library_selection: [
		{ value: 'RANDOM', label: 'Random (shearing)' },
		{ value: 'PCR', label: 'PCR' },
		{ value: 'RANDOM PCR', label: 'Random PCR' },
		{ value: 'RT-PCR', label: 'RT-PCR' },
		{ value: 'cDNA', label: 'cDNA' },
		{ value: 'Hybrid Selection', label: 'Hybrid Selection' },
		{ value: 'size fractionation', label: 'Size Fractionation' },
		{ value: 'Inverse rRNA', label: 'Inverse rRNA (depletion)' },
		{ value: 'PolyA', label: 'PolyA' },
		{ value: 'other', label: 'Other' },
		{ value: 'unspecified', label: 'Unspecified' }
	],
	barcode: [
		'BC01', 'BC02', 'BC03', 'BC04', 'BC05', 'BC06', 'BC07', 'BC08',
		'BC09', 'BC10', 'BC11', 'BC12', 'BC13', 'BC14', 'BC15', 'BC16',
		'BC17', 'BC18', 'BC19', 'BC20', 'BC21', 'BC22', 'BC23', 'BC24',
		'RB01', 'RB02', 'RB03', 'RB04', 'RB05', 'RB06', 'RB07', 'RB08',
		'RB09', 'RB10', 'RB11', 'RB12'
	],
	// What came out of an extraction — discriminator for downstream processing
	// (DNA vs cDNA goes to PCR; RNA needs reverse transcription).
	nucl_acid_type: ['DNA', 'RNA', 'Total nucleic acid', 'cDNA'],
	// Common NCBI Taxonomy taxids for environmental metagenome / eDNA samples.
	// Values are bare taxids (what MIxS samp_taxon_id + SRA metadata want);
	// labels pair the id with its NCBI taxon name for operator clarity.
	samp_taxon_id: [
		{ value: '256318', label: '256318 — metagenome' },
		{ value: '408172', label: '408172 — marine metagenome' },
		{ value: '662107', label: '662107 — seawater metagenome' },
		{ value: '410658', label: '410658 — soil metagenome' },
		{ value: '410659', label: '410659 — aquatic metagenome' },
		{ value: '533693', label: '533693 — sediment metagenome' },
		{ value: '1000570', label: '1000570 — freshwater metagenome' },
		{ value: '1176745', label: '1176745 — marine sediment metagenome' },
		{ value: '408170', label: '408170 — gut metagenome' },
		{ value: '749906', label: '749906 — ice metagenome' },
		{ value: '939928', label: '939928 — sea ice metagenome' },
		{ value: '749907', label: '749907 — hot springs metagenome' },
		{ value: '410661', label: '410661 — bioreactor metagenome' },
		{ value: '410662', label: '410662 — wastewater metagenome' }
	]
};

const PRIMER_SETS = [
	{ name: '16S V4 (515F/806R)', target_gene: '16S', target_subfragment: 'V4', forward_primer_name: '515F', forward_primer_seq: 'GTGYCAGCMGCCGCGGTAA', reverse_primer_name: '806R', reverse_primer_seq: 'GGACTACNVGGGTWTCTAAT', reference: 'Apprill et al. 2015' },
	{ name: '16S V3-V4 (341F/785R)', target_gene: '16S', target_subfragment: 'V3-V4', forward_primer_name: '341F', forward_primer_seq: 'CCTACGGGNGGCWGCAG', reverse_primer_name: '785R', reverse_primer_seq: 'GACTACHVGGGTATCTAATCC', reference: 'Klindworth et al. 2013' },
	{ name: '16S V1-V2 (27F/338R)', target_gene: '16S', target_subfragment: 'V1-V2', forward_primer_name: '27F', forward_primer_seq: 'AGAGTTTGATCMTGGCTCAG', reverse_primer_name: '338R', reverse_primer_seq: 'GCTGCCTCCCGTAGGAGT', reference: 'Daims et al. 1999' },
	{ name: '18S V4 (TAReuk454FWD1/TAReukREV3)', target_gene: '18S', target_subfragment: 'V4', forward_primer_name: 'TAReuk454FWD1', forward_primer_seq: 'CCAGCASCYGCGGTAATTCC', reverse_primer_name: 'TAReukREV3', reverse_primer_seq: 'ACTTTCGTTCTTGATYRA', reference: 'Stoeck et al. 2010' },
	{ name: '18S V9 (1391F/EukBR)', target_gene: '18S', target_subfragment: 'V9', forward_primer_name: '1391F', forward_primer_seq: 'GTACACACCGCCCGTC', reverse_primer_name: 'EukBR', reverse_primer_seq: 'TGATCCTTCTGCAGGTTCACCTAC', reference: 'Amaral-Zettler et al. 2009' },
	{ name: 'CO1 (mlCOIintF/jgHCO2198)', target_gene: 'CO1', target_subfragment: 'Leray fragment', forward_primer_name: 'mlCOIintF', forward_primer_seq: 'GGWACWGGWTGAACWGTWTAYCCYCC', reverse_primer_name: 'jgHCO2198', reverse_primer_seq: 'TAIACYTCIGGRTGICCRAARAAYCA', reference: 'Leray et al. 2013' },
	{ name: 'CO1 (BF3/BR2)', target_gene: 'CO1', target_subfragment: 'BF3-BR2', forward_primer_name: 'BF3', forward_primer_seq: 'CCHGAYATRGCHTTYCCHCG', reverse_primer_name: 'BR2', reverse_primer_seq: 'TCDGGRTGNCCRAARAAYCA', reference: 'Elbrecht & Leese 2017' },
	{ name: '12S MiFish (MiFish-U-F/MiFish-U-R)', target_gene: '12S', target_subfragment: 'MiFish', forward_primer_name: 'MiFish-U-F', forward_primer_seq: 'GTCGGTAAAACTCGTGCCAGC', reverse_primer_name: 'MiFish-U-R', reverse_primer_seq: 'CATAGTGGGGTATCTAATCCCAGTTTG', reference: 'Miya et al. 2015' },
	{ name: 'ITS1 (ITS1F/ITS2)', target_gene: 'ITS', target_subfragment: 'ITS1', forward_primer_name: 'ITS1F', forward_primer_seq: 'CTTGGTCATTTAGAGGAAGTAA', reverse_primer_name: 'ITS2', reverse_primer_seq: 'GCTGCGTTCTTCATCGATGC', reference: 'Smith & Peay 2014' },
	{ name: 'ITS2 (fITS7/ITS4)', target_gene: 'ITS', target_subfragment: 'ITS2', forward_primer_name: 'fITS7', forward_primer_seq: 'GTGARTCATCGAATCTTTG', reverse_primer_name: 'ITS4', reverse_primer_seq: 'TCCTCCGCTTATTGATATGC', reference: 'Ihrmark et al. 2012' }
];

const PCR_PROTOCOLS = [
	{ name: 'Standard 16S (55°C, 30 cycles)', polymerase: 'Q5 High-Fidelity', annealing_temp_c: 55, num_cycles: 30, pcr_cond: '98°C 30s; 30x(98°C 10s, 55°C 30s, 72°C 30s); 72°C 2min' },
	{ name: 'Standard 18S (50°C, 30 cycles)', polymerase: 'Q5 High-Fidelity', annealing_temp_c: 50, num_cycles: 30, pcr_cond: '98°C 30s; 30x(98°C 10s, 50°C 30s, 72°C 30s); 72°C 2min' },
	{ name: 'CO1 touchdown (62→46°C, 35 cycles)', polymerase: 'Phusion High-Fidelity', annealing_temp_c: 46, num_cycles: 35, pcr_cond: '98°C 30s; 16x(98°C 10s, 62°C→46°C 30s, 72°C 30s); 19x(98°C 10s, 46°C 30s, 72°C 30s); 72°C 5min' },
	{ name: '12S MiFish (65°C, 35 cycles)', polymerase: 'KAPA HiFi HotStart', annealing_temp_c: 65, num_cycles: 35, pcr_cond: '95°C 3min; 35x(98°C 20s, 65°C 15s, 72°C 15s); 72°C 5min' },
	{ name: 'ITS Standard (52°C, 30 cycles)', polymerase: 'Phusion High-Fidelity', annealing_temp_c: 52, num_cycles: 30, pcr_cond: '98°C 30s; 30x(98°C 10s, 52°C 30s, 72°C 30s); 72°C 5min' },
	{ name: 'Low-template eDNA (50°C, 45 cycles)', polymerase: 'Platinum Taq', annealing_temp_c: 50, num_cycles: 45, pcr_cond: '94°C 3min; 45x(94°C 30s, 50°C 30s, 72°C 60s); 72°C 10min' }
];

const NAMING_TEMPLATES = [
	{ value: 'project_name', label: '{PI}_{Year}_{Region}' },
	{ value: 'site_name', label: '{Location}_{Habitat}_{Number}' },
	{ value: 'sample_name', label: '{Site}_{Date}_{Number}' },
	{ value: 'extract_name', label: '{Sample}_EXT{Number}' },
	// Per-reaction PCR name. `{Extract}` is the parent DNA extract name;
	// `{Gene}` is the target gene from the chosen primer set.
	{ value: 'pcr_name', label: '{Extract}_{Gene}' },
	{ value: 'pcr_plate_name', label: '{Gene}_{Date}_{PlateNumber}' },
	// Per-library prep name. `{Source}` is the PCR reaction name or (for
	// shotgun libraries) the extract name.
	{ value: 'library_name', label: '{Source}_LIB' },
	{ value: 'library_plate_name', label: '{Type}_{Date}_{PlateNumber}' },
	{ value: 'run_name', label: 'RUN_{Date}_{Instrument}' },
];

/**
 * Seed picklists, primer sets, and PCR protocols for a specific lab. Called
 * once per lab on creation (default lab at install time, new labs via
 * scripts/create-lab.mjs). All seeds are scoped to the passed lab_id so each
 * lab gets its own customizable copy.
 *
 * Each category is seeded only if currently empty *for this lab*, so operator
 * edits are never clobbered. New SEED_DATA entries added between releases are
 * back-filled into already-seeded categories via INSERT OR IGNORE.
 */
export function seedConstrainedValues(db: Database.Database, labId: string) {
	backfillMissingEntries(db, labId);

	const insert = db.prepare(
		'INSERT OR IGNORE INTO constrained_values (id, lab_id, category, value, label, sort_order) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?)'
	);
	const countByCategory = db.prepare(
		'SELECT COUNT(*) AS count FROM constrained_values WHERE lab_id = ? AND category = ?'
	);
	const seedCategory = db.transaction((category: string, entries: SeedEntry[]) => {
		entries.forEach((entry, i) => {
			const { value, label } = normalizeSeedEntry(entry);
			insert.run(labId, category, value, label, i);
		});
	});
	for (const [category, entries] of Object.entries(SEED_DATA)) {
		const { count } = countByCategory.get(labId, category) as { count: number };
		if (count === 0) seedCategory(category, entries);
	}

	// Seed naming templates
	const namingCount = db.prepare("SELECT COUNT(*) AS count FROM constrained_values WHERE lab_id = ? AND category = 'naming_template'").get(labId) as { count: number };
	if (namingCount.count === 0) {
		const insertNaming = db.prepare('INSERT OR IGNORE INTO constrained_values (id, lab_id, category, value, label, sort_order) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?)');
		const insertAllNaming = db.transaction(() => {
			NAMING_TEMPLATES.forEach((t, i) => insertNaming.run(labId, 'naming_template', t.value, t.label, i));
		});
		insertAllNaming();
	}

	// Seed primer sets
	const primerCount = db.prepare('SELECT COUNT(*) AS count FROM primer_sets WHERE lab_id = ?').get(labId) as { count: number };
	if (primerCount.count === 0) {
		const insert = db.prepare(`INSERT OR IGNORE INTO primer_sets
			(id, lab_id, name, target_gene, target_subfragment, forward_primer_name, forward_primer_seq, reverse_primer_name, reverse_primer_seq, reference, sort_order)
			VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
		const insertAll = db.transaction(() => {
			PRIMER_SETS.forEach((p, i) => insert.run(labId, p.name, p.target_gene, p.target_subfragment, p.forward_primer_name, p.forward_primer_seq, p.reverse_primer_name, p.reverse_primer_seq, p.reference, i));
		});
		insertAll();
	}

	// Seed PCR protocols
	const protocolCount = db.prepare('SELECT COUNT(*) AS count FROM pcr_protocols WHERE lab_id = ?').get(labId) as { count: number };
	if (protocolCount.count === 0) {
		const insert = db.prepare(`INSERT OR IGNORE INTO pcr_protocols
			(id, lab_id, name, polymerase, annealing_temp_c, num_cycles, pcr_cond, sort_order)
			VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?)`);
		const insertAll = db.transaction(() => {
			PCR_PROTOCOLS.forEach((p, i) => insert.run(labId, p.name, p.polymerase, p.annealing_temp_c, p.num_cycles, p.pcr_cond, i));
		});
		insertAll();
	}
}

function normalizeSeedEntry(entry: SeedEntry): { value: string; label: string } {
	if (typeof entry === 'string') return { value: entry, label: entry };
	return entry;
}

/**
 * For categories that already have rows for this lab (so the empty-category
 * seed won't run), insert any SEED_DATA entries that are missing. Uses
 * INSERT OR IGNORE keyed on (lab_id, category, value). Handles the case
 * where SEED_DATA grows between releases.
 */
function backfillMissingEntries(db: Database.Database, labId: string) {
	const exists = db.prepare(
		'SELECT 1 FROM constrained_values WHERE lab_id = ? AND category = ? AND value = ? LIMIT 1'
	);
	const insert = db.prepare(
		'INSERT INTO constrained_values (id, lab_id, category, value, label, sort_order) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?)'
	);
	const maxOrder = db.prepare(
		'SELECT COALESCE(MAX(sort_order), -1) AS m FROM constrained_values WHERE lab_id = ? AND category = ?'
	);
	for (const [category, entries] of Object.entries(SEED_DATA)) {
		let nextOrder: number | null = null;
		for (const entry of entries) {
			const { value, label } = normalizeSeedEntry(entry);
			if (exists.get(labId, category, value)) continue;
			if (nextOrder === null) {
				nextOrder = ((maxOrder.get(labId, category) as { m: number }).m) + 1;
			}
			insert.run(labId, category, value, label, nextOrder++);
		}
	}
}

