import type Database from 'better-sqlite3';

const SEED_DATA: Record<string, string[]> = {
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
		'analyst'
	],
	habitat_type: [
		'estuary', 'kelp forest', 'intertidal', 'subtidal', 'river', 'lake', 'pond',
		'open ocean', 'coral reef', 'mangrove', 'salt marsh', 'freshwater wetland',
		'deep sea', 'hydrothermal vent', 'cold seep', 'fjord', 'bay', 'harbor',
		'stream', 'spring', 'groundwater', 'glacier', 'sea ice'
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
	sample_type: [
		'Water', 'Sediment', 'Tissue', 'Soil', 'Air filter', 'Biofilm', 'Swab',
		'Mucus', 'Gut content', 'Feces', 'Blood', 'Biopsy', 'Plankton tow', 'Other'
	],
	filter_type: [
		'Sterivex 0.22 µm', 'Sterivex 0.45 µm', 'Sterivex 0.1 µm',
		'GF/F 0.7 µm', 'MCE 0.22 µm', 'MCE 0.45 µm', 'PC 0.2 µm', 'PC 0.4 µm',
		'Whatman GF/C', 'Whatman GF/F', 'Nylon 0.22 µm', 'PVDF 0.22 µm',
		'Cellulose nitrate 0.22 µm', 'Glass fiber', 'None (grab sample)'
	],
	preservation_method: [
		'Ethanol (95%)', 'Ethanol (70%)', 'RNAlater', 'Longmire buffer',
		'CTAB buffer', 'Flash frozen (LN₂)', 'Frozen (-20°C)', 'Frozen (-80°C)',
		'Silica desiccant', 'DMSO-EDTA salt', 'Formaldehyde', 'Lugol\'s iodine',
		'None (processed immediately)'
	],
	storage_conditions: [
		'-80°C', '-20°C', '-196°C (LN₂)', '4°C', 'Room temperature', 'Desiccated'
	],
	extraction_method: [
		'Column-based', 'Phenol-chloroform', 'Bead-beating + column',
		'Magnetic bead', 'CTAB', 'Chelex', 'Direct PCR (no extraction)'
	],
	extraction_kit: [
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
	seq_platform: [
		'Illumina', 'Oxford Nanopore', 'PacBio', 'Ion Torrent'
	],
	seq_instrument: [
		'Illumina MiSeq', 'Illumina HiSeq 2500', 'Illumina HiSeq 4000',
		'Illumina NovaSeq 6000', 'Illumina NextSeq 500', 'Illumina NextSeq 2000', 'Illumina iSeq 100',
		'MinION', 'GridION', 'PromethION', 'Flongle',
		'PacBio Sequel', 'PacBio Sequel II', 'PacBio Sequel IIe', 'PacBio Revio',
		'Ion GeneStudio S5', 'Ion Torrent PGM', 'Ion Torrent Proton'
	],
	seq_method: [
		'Sequencing by synthesis', 'Nanopore sequencing', 'SMRT sequencing',
		'Ion semiconductor sequencing', 'Amplicon sequencing', 'Shotgun metagenomics',
		'RNA-seq', 'Whole genome sequencing'
	],
	library_type: [
		'16S amplicon', '18S amplicon', 'CO1 amplicon', '12S amplicon',
		'ITS amplicon', 'Nanopore metagenomic', 'Illumina metagenomic',
		'RNA-seq', 'Whole genome', 'Other'
	],
	index_i7: [
		'N701 (TAAGGCGA)', 'N702 (CGTACTAG)', 'N703 (AGGCAGAA)', 'N704 (TCCTGAGC)',
		'N705 (GGACTCCT)', 'N706 (TAGGCATG)', 'N707 (CTCTCTAC)', 'N708 (CAGAGAGG)',
		'N709 (GCTACGCT)', 'N710 (CGAGGCTG)', 'N711 (AAGAGGCA)', 'N712 (GTAGAGGA)',
		'UDP0001 (GAACTGAGCG)', 'UDP0002 (AGGTCAGATA)', 'UDP0003 (CGTCTCATAT)',
		'UDP0004 (ATTCCATAAG)', 'UDP0005 (GACGAGATTA)', 'UDP0006 (AACATCGCGC)',
		'UDP0007 (CTAGTCGAAT)', 'UDP0008 (GATCAAGGCA)'
	],
	index_i5: [
		'S501 (TAGATCGC)', 'S502 (CTCTCTAT)', 'S503 (TATCCTCT)', 'S504 (AGAGTAGA)',
		'S505 (GTAAGGAG)', 'S506 (ACTGCATA)', 'S507 (AAGGAGTA)', 'S508 (CTAAGCCT)',
		'UDP0001 (CGCTCCACGA)', 'UDP0002 (TATGAGACTT)', 'UDP0003 (AGGTGCGT)',
		'UDP0004 (GAACATACGG)', 'UDP0005 (AACTGTAG)', 'UDP0006 (CATGCCTA)'
	],
	barcode: [
		'BC01', 'BC02', 'BC03', 'BC04', 'BC05', 'BC06', 'BC07', 'BC08',
		'BC09', 'BC10', 'BC11', 'BC12', 'BC13', 'BC14', 'BC15', 'BC16',
		'BC17', 'BC18', 'BC19', 'BC20', 'BC21', 'BC22', 'BC23', 'BC24',
		'RB01', 'RB02', 'RB03', 'RB04', 'RB05', 'RB06', 'RB07', 'RB08',
		'RB09', 'RB10', 'RB11', 'RB12'
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
	{ name: 'Standard 16S (55°C, 30 cycles)', polymerase: 'Q5 High-Fidelity', annealing_temp_c: 55, num_cycles: 30, pcr_conditions: '98°C 30s; 30x(98°C 10s, 55°C 30s, 72°C 30s); 72°C 2min' },
	{ name: 'Standard 18S (50°C, 30 cycles)', polymerase: 'Q5 High-Fidelity', annealing_temp_c: 50, num_cycles: 30, pcr_conditions: '98°C 30s; 30x(98°C 10s, 50°C 30s, 72°C 30s); 72°C 2min' },
	{ name: 'CO1 touchdown (62→46°C, 35 cycles)', polymerase: 'Phusion High-Fidelity', annealing_temp_c: 46, num_cycles: 35, pcr_conditions: '98°C 30s; 16x(98°C 10s, 62°C→46°C 30s, 72°C 30s); 19x(98°C 10s, 46°C 30s, 72°C 30s); 72°C 5min' },
	{ name: '12S MiFish (65°C, 35 cycles)', polymerase: 'KAPA HiFi HotStart', annealing_temp_c: 65, num_cycles: 35, pcr_conditions: '95°C 3min; 35x(98°C 20s, 65°C 15s, 72°C 15s); 72°C 5min' },
	{ name: 'ITS Standard (52°C, 30 cycles)', polymerase: 'Phusion High-Fidelity', annealing_temp_c: 52, num_cycles: 30, pcr_conditions: '98°C 30s; 30x(98°C 10s, 52°C 30s, 72°C 30s); 72°C 5min' },
	{ name: 'Low-template eDNA (50°C, 45 cycles)', polymerase: 'Platinum Taq', annealing_temp_c: 50, num_cycles: 45, pcr_conditions: '94°C 3min; 45x(94°C 30s, 50°C 30s, 72°C 60s); 72°C 10min' }
];

const NAMING_TEMPLATES = [
	{ value: 'project_name', label: '{PI}_{Year}_{Region}' },
	{ value: 'site_name', label: '{Location}_{Habitat}_{Number}' },
	{ value: 'sample_name', label: '{Site}_{Date}_{Number}' },
	{ value: 'extract_name', label: '{Sample}_EXT{Number}' },
	{ value: 'pcr_plate_name', label: '{Gene}_{Date}_{PlateNumber}' },
	{ value: 'library_plate_name', label: '{Type}_{Date}_{PlateNumber}' },
	{ value: 'run_name', label: 'RUN_{Date}_{Instrument}' },
];

export function seedConstrainedValues(db: Database.Database) {
	const existing = db.prepare('SELECT COUNT(*) AS count FROM constrained_values').get() as { count: number };
	if (existing.count === 0) {
		const insert = db.prepare('INSERT OR IGNORE INTO constrained_values (id, category, value, sort_order) VALUES (lower(hex(randomblob(16))), ?, ?, ?)');
		const insertAll = db.transaction(() => {
			for (const [category, values] of Object.entries(SEED_DATA)) {
				values.forEach((value, i) => insert.run(category, value, i));
			}
		});
		insertAll();
	}

	// Seed naming templates
	const namingCount = db.prepare("SELECT COUNT(*) AS count FROM constrained_values WHERE category = 'naming_template'").get() as { count: number };
	if (namingCount.count === 0) {
		const insertNaming = db.prepare('INSERT OR IGNORE INTO constrained_values (id, category, value, label, sort_order) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?)');
		const insertAllNaming = db.transaction(() => {
			NAMING_TEMPLATES.forEach((t, i) => insertNaming.run('naming_template', t.value, t.label, i));
		});
		insertAllNaming();
	}

	// Seed primer sets
	const primerCount = db.prepare('SELECT COUNT(*) AS count FROM primer_sets').get() as { count: number };
	if (primerCount.count === 0) {
		const insert = db.prepare(`INSERT OR IGNORE INTO primer_sets
			(id, name, target_gene, target_subfragment, forward_primer_name, forward_primer_seq, reverse_primer_name, reverse_primer_seq, reference, sort_order)
			VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
		const insertAll = db.transaction(() => {
			PRIMER_SETS.forEach((p, i) => insert.run(p.name, p.target_gene, p.target_subfragment, p.forward_primer_name, p.forward_primer_seq, p.reverse_primer_name, p.reverse_primer_seq, p.reference, i));
		});
		insertAll();
	}

	// Seed PCR protocols
	const protocolCount = db.prepare('SELECT COUNT(*) AS count FROM pcr_protocols').get() as { count: number };
	if (protocolCount.count === 0) {
		const insert = db.prepare(`INSERT OR IGNORE INTO pcr_protocols
			(id, name, polymerase, annealing_temp_c, num_cycles, pcr_conditions, sort_order)
			VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?)`);
		const insertAll = db.transaction(() => {
			PCR_PROTOCOLS.forEach((p, i) => insert.run(p.name, p.polymerase, p.annealing_temp_c, p.num_cycles, p.pcr_conditions, i));
		});
		insertAll();
	}
}
