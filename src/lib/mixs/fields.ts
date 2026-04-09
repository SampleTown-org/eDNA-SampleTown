import type { EnvPackage } from '$lib/types';

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'coordinates' | 'textarea';

export interface MixsField {
	name: string;
	label: string;
	type: FieldType;
	required: boolean;
	description: string;
	sra_column: string;
	pattern?: RegExp;
	options?: { value: string; label: string }[];
	placeholder?: string;
	unit?: string;
}

/** Core fields required for ALL MIxS checklists */
export const CORE_FIELDS: MixsField[] = [
	{
		name: 'samp_name',
		label: 'Sample Name',
		type: 'text',
		required: true,
		description: 'Unique local identifier for the sample',
		sra_column: 'sample_name',
		placeholder: 'e.g., eDNA_River_2026_001'
	},
	{
		name: 'collection_date',
		label: 'Collection Date',
		type: 'date',
		required: true,
		description: 'Date of sampling in ISO 8601 format',
		sra_column: 'collection_date',
		pattern: /^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2})?)?)?)?$/
	},
	{
		name: 'lat_lon',
		label: 'Latitude/Longitude',
		type: 'coordinates',
		required: true,
		description: 'Geographical coordinates as "dd.dddd N|S dd.dddd W|E"',
		sra_column: 'lat_lon',
		pattern: /^\d+(\.\d+)?\s[NS]\s\d+(\.\d+)?\s[WE]$/,
		placeholder: 'e.g., 45.5231 N 122.6765 W'
	},
	{
		name: 'geo_loc_name',
		label: 'Geographic Location',
		type: 'text',
		required: true,
		description: 'Geographical origin using INSDC country list: "Country: Region"',
		sra_column: 'geo_loc_name',
		placeholder: 'e.g., Canada: British Columbia'
	},
	{
		name: 'env_broad_scale',
		label: 'Broad-scale Environment',
		type: 'text',
		required: true,
		description: 'Broad ecological context using ENVO biome terms',
		sra_column: 'env_broad_scale',
		placeholder: 'e.g., marine biome [ENVO:00000447]'
	},
	{
		name: 'env_local_scale',
		label: 'Local Environment',
		type: 'text',
		required: true,
		description: 'Local environmental context using ENVO feature terms',
		sra_column: 'env_local_scale',
		placeholder: 'e.g., coastal water [ENVO:00002150]'
	},
	{
		name: 'env_medium',
		label: 'Environmental Medium',
		type: 'text',
		required: true,
		description: 'Environmental material using ENVO material terms',
		sra_column: 'env_medium',
		placeholder: 'e.g., sea water [ENVO:00002149]'
	}
];

/** Environmental package-specific required fields */
export const PACKAGE_FIELDS: Record<EnvPackage, MixsField[]> = {
	water: [
		{
			name: 'depth',
			label: 'Depth',
			type: 'text',
			required: true,
			description: 'Depth of sample collection',
			sra_column: 'depth',
			placeholder: 'e.g., 10 m',
			unit: 'm'
		}
	],
	sediment: [
		{
			name: 'depth',
			label: 'Depth',
			type: 'text',
			required: true,
			description: 'Depth of sample collection',
			sra_column: 'depth',
			placeholder: 'e.g., 0.5 m',
			unit: 'm'
		}
	],
	soil: [
		{
			name: 'elevation',
			label: 'Elevation',
			type: 'text',
			required: true,
			description: 'Elevation of sampling site',
			sra_column: 'elev',
			placeholder: 'e.g., 100 m',
			unit: 'm'
		}
	],
	air: [
		{
			name: 'elevation',
			label: 'Elevation/Altitude',
			type: 'text',
			required: true,
			description: 'Altitude of sampling site',
			sra_column: 'alt',
			placeholder: 'e.g., 500 m',
			unit: 'm'
		}
	],
	'host-associated': [
		{
			name: 'host_taxon_id',
			label: 'Host Organism',
			type: 'text',
			required: true,
			description: 'NCBI taxonomy ID or name of the host organism',
			sra_column: 'host',
			placeholder: 'e.g., Oncorhynchus mykiss'
		}
	],
	built: [],
	'plant-associated': [
		{
			name: 'host_taxon_id',
			label: 'Host Plant',
			type: 'text',
			required: true,
			description: 'NCBI taxonomy ID or name of the host plant',
			sra_column: 'host',
			placeholder: 'e.g., Picea sitchensis'
		}
	],
	agriculture: []
};

/** Optional measurement fields available for all samples */
export const MEASUREMENT_FIELDS: MixsField[] = [
	{
		name: 'temp',
		label: 'Temperature',
		type: 'number',
		required: false,
		description: 'Temperature at sampling site',
		sra_column: 'temp',
		unit: '°C'
	},
	{
		name: 'salinity',
		label: 'Salinity',
		type: 'number',
		required: false,
		description: 'Salinity of sample',
		sra_column: 'salinity',
		unit: 'PSU'
	},
	{
		name: 'ph',
		label: 'pH',
		type: 'number',
		required: false,
		description: 'pH of sample',
		sra_column: 'ph'
	},
	{
		name: 'dissolved_oxygen',
		label: 'Dissolved Oxygen',
		type: 'number',
		required: false,
		description: 'Dissolved oxygen concentration',
		sra_column: 'diss_oxygen',
		unit: 'mg/L'
	},
	{
		name: 'pressure',
		label: 'Pressure',
		type: 'number',
		required: false,
		description: 'Pressure at sampling depth',
		sra_column: 'pressure',
		unit: 'atm'
	},
	{
		name: 'turbidity',
		label: 'Turbidity',
		type: 'number',
		required: false,
		description: 'Turbidity of sample',
		sra_column: 'turbidity',
		unit: 'NTU'
	},
	{
		name: 'chlorophyll',
		label: 'Chlorophyll',
		type: 'number',
		required: false,
		description: 'Chlorophyll concentration',
		sra_column: 'chlorophyll',
		unit: 'µg/L'
	},
	{
		name: 'nitrate',
		label: 'Nitrate',
		type: 'number',
		required: false,
		description: 'Nitrate concentration',
		sra_column: 'nitrate',
		unit: 'µmol/L'
	},
	{
		name: 'phosphate',
		label: 'Phosphate',
		type: 'number',
		required: false,
		description: 'Phosphate concentration',
		sra_column: 'phosphate',
		unit: 'µmol/L'
	}
];

/** Sample logistics fields */
export const LOGISTICS_FIELDS: MixsField[] = [
	{
		name: 'sample_type',
		label: 'Sample Type',
		type: 'select',
		required: false,
		description: 'Type of physical sample',
		sra_column: 'sample_type',
		options: [
			{ value: 'water', label: 'Water' },
			{ value: 'sediment', label: 'Sediment' },
			{ value: 'tissue', label: 'Tissue' },
			{ value: 'soil', label: 'Soil' },
			{ value: 'air_filter', label: 'Air Filter' },
			{ value: 'biofilm', label: 'Biofilm' },
			{ value: 'swab', label: 'Swab' },
			{ value: 'other', label: 'Other' }
		]
	},
	{
		name: 'volume_filtered_ml',
		label: 'Volume Filtered',
		type: 'number',
		required: false,
		description: 'Volume of water filtered',
		sra_column: 'samp_vol_we_dna_ext',
		unit: 'mL'
	},
	{
		name: 'filter_type',
		label: 'Filter Type',
		type: 'text',
		required: false,
		description: 'Type and pore size of filter used',
		sra_column: 'filter_type',
		placeholder: 'e.g., Sterivex 0.22 µm'
	},
	{
		name: 'preservation_method',
		label: 'Preservation Method',
		type: 'text',
		required: false,
		description: 'Method used to preserve the sample',
		sra_column: 'samp_store_sol',
		placeholder: 'e.g., ethanol, RNAlater, frozen'
	},
	{
		name: 'storage_conditions',
		label: 'Storage Conditions',
		type: 'text',
		required: false,
		description: 'Temperature and conditions of storage',
		sra_column: 'samp_store_temp',
		placeholder: 'e.g., -20°C'
	},
	{
		name: 'collector_name',
		label: 'Collector',
		type: 'text',
		required: false,
		description: 'Name of person who collected the sample',
		sra_column: 'collected_by'
	}
];

/** Get all required fields for a given env_package */
export function getRequiredFields(envPackage: EnvPackage): MixsField[] {
	return [...CORE_FIELDS, ...(PACKAGE_FIELDS[envPackage] || [])];
}

/** Get all fields organized by section */
export function getAllFieldSections(envPackage: EnvPackage) {
	return {
		core: CORE_FIELDS,
		package: PACKAGE_FIELDS[envPackage] || [],
		measurements: MEASUREMENT_FIELDS,
		logistics: LOGISTICS_FIELDS
	};
}
