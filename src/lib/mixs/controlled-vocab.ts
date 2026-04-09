/** INSDC country list (subset of most common) */
export const INSDC_COUNTRIES = [
	'Antarctica',
	'Arctic Ocean',
	'Atlantic Ocean',
	'Australia',
	'Brazil',
	'Canada',
	'Chile',
	'China',
	'Denmark',
	'Finland',
	'France',
	'Germany',
	'Greenland',
	'Iceland',
	'India',
	'Indonesia',
	'Italy',
	'Japan',
	'Mexico',
	'Netherlands',
	'New Zealand',
	'Norway',
	'Pacific Ocean',
	'Peru',
	'Philippines',
	'Russia',
	'South Africa',
	'South Korea',
	'Spain',
	'Sweden',
	'United Kingdom',
	'USA'
] as const;

/** Common ENVO biome terms for env_broad_scale */
export const ENVO_BIOMES = [
	{ id: 'ENVO:00000447', label: 'marine biome' },
	{ id: 'ENVO:00000873', label: 'freshwater biome' },
	{ id: 'ENVO:00000446', label: 'terrestrial biome' },
	{ id: 'ENVO:01000219', label: 'anthropogenic terrestrial biome' },
	{ id: 'ENVO:01000174', label: 'forest biome' },
	{ id: 'ENVO:01000175', label: 'woodland biome' },
	{ id: 'ENVO:01000176', label: 'shrubland biome' },
	{ id: 'ENVO:01000177', label: 'grassland biome' },
	{ id: 'ENVO:01000178', label: 'savanna biome' },
	{ id: 'ENVO:01000179', label: 'desert biome' },
	{ id: 'ENVO:01000180', label: 'tundra biome' },
	{ id: 'ENVO:01000181', label: 'mangrove biome' },
	{ id: 'ENVO:01000228', label: 'coastal biome' },
	{ id: 'ENVO:01000030', label: 'aquatic biome' },
	{ id: 'ENVO:01000048', label: 'ocean biome' },
	{ id: 'ENVO:01000253', label: 'freshwater lake biome' },
	{ id: 'ENVO:01000254', label: 'freshwater river biome' },
	{ id: 'ENVO:00000872', label: 'estuary biome' }
] as const;

/** Common ENVO feature terms for env_local_scale */
export const ENVO_FEATURES = [
	{ id: 'ENVO:00000015', label: 'ocean' },
	{ id: 'ENVO:00000016', label: 'sea' },
	{ id: 'ENVO:00000020', label: 'lake' },
	{ id: 'ENVO:00000022', label: 'river' },
	{ id: 'ENVO:00000027', label: 'spring' },
	{ id: 'ENVO:00000033', label: 'pond' },
	{ id: 'ENVO:00000039', label: 'fjord' },
	{ id: 'ENVO:00000045', label: 'estuary' },
	{ id: 'ENVO:00000054', label: 'beach' },
	{ id: 'ENVO:00000138', label: 'reef' },
	{ id: 'ENVO:00000233', label: 'bay' },
	{ id: 'ENVO:00000317', label: 'harbour' },
	{ id: 'ENVO:00002150', label: 'coastal water' },
	{ id: 'ENVO:00000043', label: 'wetland' },
	{ id: 'ENVO:00002006', label: 'forest floor' },
	{ id: 'ENVO:00000446', label: 'terrestrial biome' },
	{ id: 'ENVO:00000114', label: 'agricultural field' }
] as const;

/** Common ENVO material terms for env_medium */
export const ENVO_MATERIALS = [
	{ id: 'ENVO:00002149', label: 'sea water' },
	{ id: 'ENVO:00002011', label: 'fresh water' },
	{ id: 'ENVO:00002006', label: 'water' },
	{ id: 'ENVO:00002007', label: 'sediment' },
	{ id: 'ENVO:00001998', label: 'soil' },
	{ id: 'ENVO:00002005', label: 'air' },
	{ id: 'ENVO:00002002', label: 'feces' },
	{ id: 'ENVO:00005774', label: 'mud' },
	{ id: 'ENVO:00002008', label: 'sand' },
	{ id: 'ENVO:00002042', label: 'surface water' },
	{ id: 'ENVO:00002041', label: 'ground water' },
	{ id: 'ENVO:00005792', label: 'biofilm' },
	{ id: 'ENVO:00002044', label: 'sludge' },
	{ id: 'ENVO:00002010', label: 'saline water' },
	{ id: 'ENVO:00002043', label: 'brackish water' },
	{ id: 'ENVO:00005791', label: 'porewater' }
] as const;

/** Sequencing platforms for SRA */
export const SEQUENCING_PLATFORMS = [
	{ value: 'ILLUMINA', label: 'Illumina' },
	{ value: 'OXFORD_NANOPORE', label: 'Oxford Nanopore' },
	{ value: 'PACBIO', label: 'PacBio' },
	{ value: 'ION_TORRENT', label: 'Ion Torrent' }
] as const;

/** Common instrument models */
export const INSTRUMENT_MODELS: Record<string, string[]> = {
	ILLUMINA: [
		'Illumina MiSeq',
		'Illumina HiSeq 2500',
		'Illumina HiSeq 4000',
		'Illumina NovaSeq 6000',
		'Illumina NextSeq 500',
		'Illumina NextSeq 2000',
		'Illumina iSeq 100'
	],
	OXFORD_NANOPORE: [
		'MinION',
		'GridION',
		'PromethION',
		'Flongle'
	],
	PACBIO: [
		'PacBio Sequel',
		'PacBio Sequel II',
		'PacBio Sequel IIe',
		'PacBio Revio'
	],
	ION_TORRENT: [
		'Ion GeneStudio S5',
		'Ion Torrent PGM',
		'Ion Torrent Proton'
	]
};

/** Environmental packages */
export const ENV_PACKAGES = [
	{ value: 'water', label: 'Water' },
	{ value: 'soil', label: 'Soil' },
	{ value: 'sediment', label: 'Sediment' },
	{ value: 'host-associated', label: 'Host-associated' },
	{ value: 'air', label: 'Air' },
	{ value: 'built', label: 'Built environment' },
	{ value: 'plant-associated', label: 'Plant-associated' },
	{ value: 'agriculture', label: 'Agriculture' }
] as const;
