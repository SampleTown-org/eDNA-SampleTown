#!/usr/bin/env node
/**
 * Seed the McGurk Institute lab with Arrowsmith-inspired demo data.
 *
 * Usage:
 *   node scripts/seed-mcgurk-demo.mjs
 *   DB_PATH=/opt/sampletown/data/sampletown.db node scripts/seed-mcgurk-demo.mjs
 */
import Database from 'better-sqlite3';
import { randomBytes } from 'crypto';

const DB_PATH = process.env.DB_PATH || 'data/sampletown.db';
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const LAB_ID = 'a06ff4182a9d6f805158d1bc7cfec924'; // McGurk Institute

function id() { return randomBytes(16).toString('hex'); }

// Verify the lab exists
const lab = db.prepare('SELECT id, name FROM labs WHERE id = ?').get(LAB_ID);
if (!lab) { console.error('McGurk Institute lab not found'); process.exit(1); }

// Skip if already seeded
const existing = db.prepare('SELECT COUNT(*) as n FROM projects WHERE lab_id = ?').get(LAB_ID);
if (existing.n > 0) { console.log('McGurk Institute already has projects — skipping seed.'); process.exit(0); }

const tx = db.transaction(() => {
	// ============================================================
	// PERSONNEL
	// ============================================================
	const personnel = {};
	const insertPerson = db.prepare(
		`INSERT INTO personnel (id, lab_id, full_name, email, role, institution, orcid, is_active)
		 VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
	);
	const people = [
		{ key: 'arrowsmith', name: 'Martin Arrowsmith', email: 'arrowsmith@mcgurk.edu', role: 'PI', inst: 'McGurk Institute' },
		{ key: 'gottlieb', name: 'Max Gottlieb', email: 'gottlieb@mcgurk.edu', role: 'PI', inst: 'McGurk Institute', orcid: '0000-0001-0000-0001' },
		{ key: 'wickett', name: 'Terry Wickett', email: 'wickett@mcgurk.edu', role: 'Lab Manager', inst: 'McGurk Institute' },
		{ key: 'sondelius', name: 'Gustaf Sondelius', email: 'sondelius@who.int', role: 'Collaborator', inst: 'League of Nations Health Office' },
		{ key: 'leora', name: 'Leora Arrowsmith', email: 'leora@mcgurk.edu', role: 'Lab Tech', inst: 'McGurk Institute' },
		{ key: 'tubbs', name: 'A. DeWitt Tubbs', email: 'tubbs@mcgurk.edu', role: 'PI', inst: 'McGurk Institute' },
		{ key: 'pickerbaugh', name: 'Almus Pickerbaugh', email: 'pickerbaugh@zenith.gov', role: 'Collaborator', inst: 'Zenith Dept. of Public Health' },
		{ key: 'silva', name: 'Inchcape Jones', email: 'jones@sthubert.gov', role: 'Collaborator', inst: 'St. Hubert Board of Health' },
	];
	for (const p of people) {
		const pid = id();
		personnel[p.key] = pid;
		insertPerson.run(pid, LAB_ID, p.name, p.email, p.role, p.inst, p.orcid ?? null);
	}

	// ============================================================
	// PROJECTS
	// ============================================================
	const projects = {};
	const insertProject = db.prepare(
		`INSERT INTO projects (id, lab_id, project_name, description, pi_name, institution, contact_email, funding_sources)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	);

	const projData = [
		{
			key: 'phage', name: 'Phage Therapy Trials',
			desc: 'Controlled studies of bacteriophage d\'Hérelle as a therapeutic agent against bacterial infection. Cultures isolated from sewage outflows and hospital drainage, tested in vitro and in animal models.',
			pi: 'Martin Arrowsmith', inst: 'McGurk Institute', email: 'arrowsmith@mcgurk.edu',
			funding: 'McGurk Foundation for Medical Research\nRockefeller General Education Board'
		},
		{
			key: 'plague', name: 'St. Hubert Plague Survey',
			desc: 'Field epidemiological survey and phage intervention trial during the pneumonic plague outbreak on the island of St. Hubert, British West Indies. Environmental sampling of vector habitats and water sources.',
			pi: 'Martin Arrowsmith', inst: 'McGurk Institute', email: 'arrowsmith@mcgurk.edu',
			funding: 'McGurk Institute Emergency Fund\nBritish Colonial Office'
		},
		{
			key: 'soil', name: 'Zenith Region Soil Bacteriology',
			desc: 'Baseline survey of soil microbial communities in agricultural and riparian zones of the Zenith River watershed, Winnemac. Part of a broader study of environmental reservoirs of pathogenic organisms.',
			pi: 'Max Gottlieb', inst: 'McGurk Institute', email: 'gottlieb@mcgurk.edu',
			funding: 'Winnemac State Board of Health\nU.S. Public Health Service'
		},
	];
	for (const p of projData) {
		const pid = id();
		projects[p.key] = pid;
		insertProject.run(pid, LAB_ID, p.name, p.desc, p.pi, p.inst, p.email, p.funding);
	}

	// ============================================================
	// SITES
	// ============================================================
	const sites = {};
	const insertSite = db.prepare(
		`INSERT INTO sites (id, lab_id, project_id, site_name, description, latitude, longitude, lat_lon, geo_loc_name, locality, env_broad_scale, env_local_scale, notes)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	);

	const siteData = [
		// Phage project
		{ key: 'mcgurk_lab', proj: 'phage', name: 'McGurk Institute Drainage', desc: 'Sewage outflow beneath the institute building. Primary source of phage isolates.', lat: 40.7648, lon: -73.9558, geo: 'USA:New York', loc: 'Upper East Side, Manhattan', biome: 'urban biome', feature: 'sewer' },
		{ key: 'east_river', proj: 'phage', name: 'East River Intake', desc: 'River water sampling point near the Rockefeller Institute pier. Control site for environmental phage abundance.', lat: 40.7632, lon: -73.9542, geo: 'USA:New York', loc: 'East River, Manhattan', biome: 'coastal biome', feature: 'river' },

		// Plague project
		{ key: 'blackwater', proj: 'plague', name: 'Blackwater Harbor', desc: 'Main port of St. Hubert. Rat trapping and harbor water sampling. Initial cases reported in dockside warehouses.', lat: 17.12, lon: -61.85, geo: 'Saint Kitts and Nevis', loc: 'Blackwater', biome: 'coastal biome', feature: 'harbour', notes: 'Restricted area — colonial quarantine zone. Permission via Inchcape Jones.' },
		{ key: 'dogtail', proj: 'plague', name: 'Dogtail Point', desc: 'Headland north of Blackwater with extensive rat colonies in coconut groves. Highest plague incidence in the rural zone.', lat: 17.14, lon: -61.83, geo: 'Saint Kitts and Nevis', loc: 'Dogtail Point', biome: 'coastal biome', feature: 'beach' },
		{ key: 'carib', proj: 'plague', name: 'Dogtail Point Inland', desc: 'Village in the interior. Control population for the phage intervention trial — half received phage, half did not.', lat: 17.15, lon: -61.80, geo: 'Saint Kitts and Nevis', loc: 'Dogtail Inland', biome: 'terrestrial biome', feature: 'agricultural field' },
		{ key: 'manchuria_spring', proj: 'plague', name: 'Dogtail Spring', desc: 'Freshwater spring used by the village. Sampled for waterborne transmission assessment.', lat: 17.155, lon: -61.801, geo: 'Saint Kitts and Nevis', loc: 'Dogtail Inland', biome: 'freshwater biome', feature: 'spring' },

		// Soil project
		{ key: 'elk_mills', proj: 'soil', name: 'Elk Mills Farm', desc: 'Mixed-use dairy and grain farm. Sampling along a transect from barnyard to unimproved pasture.', lat: 42.45, lon: -88.60, geo: 'USA:Winnemac', loc: 'Elk Mills', biome: 'grassland biome', feature: 'agricultural field' },
		{ key: 'zenith_river', proj: 'soil', name: 'Zenith River Riparian', desc: 'Riparian buffer zone along the Zenith River. Seasonally flooded bottomland forest.', lat: 42.50, lon: -88.55, geo: 'USA:Winnemac', loc: 'Zenith River', biome: 'freshwater biome', feature: 'river' },
		{ key: 'wheatsylvania', proj: 'soil', name: 'Wheatsylvania Prairie', desc: 'Remnant tallgrass prairie plot on the Tozer homestead. Unplowed since settlement.', lat: 42.60, lon: -88.70, geo: 'USA:Winnemac', loc: 'Wheatsylvania', biome: 'grassland biome', feature: 'forest floor' },
	];

	for (const s of siteData) {
		const sid = id();
		sites[s.key] = sid;
		const latlon = `${Math.abs(s.lat).toFixed(4)} ${s.lat >= 0 ? 'N' : 'S'} ${Math.abs(s.lon).toFixed(4)} ${s.lon >= 0 ? 'E' : 'W'}`;
		insertSite.run(sid, LAB_ID, projects[s.proj], s.name, s.desc, s.lat, s.lon, latlon, s.geo, s.loc, s.biome, s.feature, s.notes ?? null);
	}

	// ============================================================
	// SAMPLES
	// ============================================================
	const samples = {};
	const insertSample = db.prepare(
		`INSERT INTO samples (id, lab_id, project_id, site_id, samp_name, collection_date, env_medium, depth, temp, salinity, ph, samp_collect_device, samp_collect_method, samp_size, filter_type, samp_store_sol, samp_store_temp, collector_name, notes)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	);

	const sampleData = [
		// Phage project samples
		{ key: 'sewage_01', proj: 'phage', site: 'mcgurk_lab', name: 'MCGK-SEW-001', date: '1927-03-10', medium: 'wastewater', depth: '2 m', temp: 14.2, sal: null, ph: 7.1, device: 'bucket', method: 'grab sample', size: '1 L', filter: 'MCE 0.22 µm', preserv: 'Frozen (-20°C)', stemp: '-20 degree Celsius', collector: 'Martin Arrowsmith', notes: 'Turbid, grey. Strong odor. Collected at 06:00 before institute opens.' },
		{ key: 'sewage_02', proj: 'phage', site: 'mcgurk_lab', name: 'MCGK-SEW-002', date: '1927-03-17', medium: 'wastewater', depth: '2 m', temp: 13.8, sal: null, ph: 7.3, device: 'bucket', method: 'grab sample', size: '1 L', filter: 'MCE 0.22 µm', preserv: 'Frozen (-20°C)', stemp: '-20 degree Celsius', collector: 'Terry Wickett' },
		{ key: 'river_01', proj: 'phage', site: 'east_river', name: 'MCGK-ER-001', date: '1927-03-10', medium: 'sea water', depth: '0.5 m', temp: 5.6, sal: 18.5, ph: 7.8, device: 'Niskin bottle', method: 'grab sample', size: '2 L', filter: 'Sterivex 0.22 µm', preserv: 'Frozen (-20°C)', stemp: '-20 degree Celsius', collector: 'Martin Arrowsmith' },
		{ key: 'river_02', proj: 'phage', site: 'east_river', name: 'MCGK-ER-002', date: '1927-04-14', medium: 'sea water', depth: '0.5 m', temp: 8.2, sal: 19.1, ph: 7.9, device: 'Niskin bottle', method: 'grab sample', size: '2 L', filter: 'Sterivex 0.22 µm', preserv: 'Frozen (-20°C)', stemp: '-20 degree Celsius', collector: 'Leora Arrowsmith' },

		// Plague project samples
		{ key: 'harbor_01', proj: 'plague', site: 'blackwater', name: 'STH-BW-001', date: '1927-08-05', medium: 'sea water', depth: '0.3 m', temp: 28.9, sal: 35.2, ph: 8.1, device: 'bucket', method: 'grab sample', size: '2 L', filter: 'Sterivex 0.22 µm', preserv: 'Ethanol (95%)', stemp: 'room temperature', collector: 'Gustaf Sondelius', notes: 'Collected near warehouse district. Several dead rats observed on wharf.' },
		{ key: 'harbor_02', proj: 'plague', site: 'blackwater', name: 'STH-BW-002', date: '1927-08-05', medium: 'sediment', depth: null, temp: 29.1, sal: null, ph: 7.4, device: 'grab sampler', method: 'grab sample', size: '200 g', filter: null, preserv: 'Ethanol (95%)', stemp: 'room temperature', collector: 'Gustaf Sondelius' },
		{ key: 'dogtail_01', proj: 'plague', site: 'dogtail', name: 'STH-DT-001', date: '1927-08-12', medium: 'soil', depth: null, temp: 31.5, sal: null, ph: 6.8, device: 'scoop', method: 'grab sample', size: '100 g', filter: null, preserv: 'Ethanol (95%)', stemp: 'room temperature', collector: 'Martin Arrowsmith', notes: 'Soil beneath coconut palms. Rat burrows visible within 3 m.' },
		{ key: 'spring_01', proj: 'plague', site: 'manchuria_spring', name: 'STH-SP-001', date: '1927-08-15', medium: 'fresh water', depth: '0 m', temp: 25.3, sal: 0.1, ph: 7.2, device: 'syringe', method: 'grab sample', size: '500 mL', filter: 'Sterivex 0.22 µm', preserv: 'Ethanol (95%)', stemp: 'room temperature', collector: 'Martin Arrowsmith', notes: 'Spring source for the inland village. Clear water, low flow.' },
		{ key: 'carib_01', proj: 'plague', site: 'carib', name: 'STH-CV-001', date: '1927-08-18', medium: 'soil', depth: null, temp: 30.0, sal: null, ph: 6.5, device: 'scoop', method: 'grab sample', size: '100 g', filter: null, preserv: 'Ethanol (95%)', stemp: 'room temperature', collector: 'Martin Arrowsmith' },

		// Soil project samples
		{ key: 'elk_01', proj: 'soil', site: 'elk_mills', name: 'ZEN-ELK-001', date: '1926-06-20', medium: 'soil', depth: '0.15 m', temp: 18.5, sal: null, ph: 6.9, device: 'push core', method: 'corer', size: '50 g', filter: null, preserv: 'Frozen (-20°C)', stemp: '-20 degree Celsius', collector: 'Max Gottlieb' },
		{ key: 'elk_02', proj: 'soil', site: 'elk_mills', name: 'ZEN-ELK-002', date: '1926-06-20', medium: 'soil', depth: '0.30 m', temp: 15.2, sal: null, ph: 7.0, device: 'push core', method: 'corer', size: '50 g', filter: null, preserv: 'Frozen (-20°C)', stemp: '-20 degree Celsius', collector: 'Max Gottlieb', notes: 'Subsoil layer. Transition from loam to clay.' },
		{ key: 'river_s01', proj: 'soil', site: 'zenith_river', name: 'ZEN-RIV-001', date: '1926-06-22', medium: 'fresh water', depth: '0.5 m', temp: 20.1, sal: null, ph: 7.5, device: 'Van Dorn bottle', method: 'grab sample', size: '1 L', filter: 'GF/F 0.7 µm', preserv: 'Frozen (-20°C)', stemp: '-20 degree Celsius', collector: 'Terry Wickett' },
		{ key: 'prairie_01', proj: 'soil', site: 'wheatsylvania', name: 'ZEN-WH-001', date: '1926-07-04', medium: 'soil', depth: '0.10 m', temp: 22.0, sal: null, ph: 6.4, device: 'push core', method: 'corer', size: '50 g', filter: null, preserv: 'Frozen (-20°C)', stemp: '-20 degree Celsius', collector: 'Martin Arrowsmith', notes: 'Independence Day collection. Rich black topsoil, dense root mat.' },
	];

	for (const s of sampleData) {
		const sid = id();
		samples[s.key] = sid;
		insertSample.run(sid, LAB_ID, projects[s.proj], sites[s.site], s.name, s.date, s.medium, s.depth ?? null, s.temp ?? null, s.sal ?? null, s.ph ?? null, s.device ?? null, s.method ?? null, s.size ?? null, s.filter ?? null, s.preserv ?? null, s.stemp ?? null, s.collector ?? null, s.notes ?? null);
	}

	// ============================================================
	// EXTRACTS
	// ============================================================
	const extracts = {};
	const insertExtract = db.prepare(
		`INSERT INTO extracts (id, lab_id, sample_id, extract_name, extraction_date, extraction_method, nucl_acid_type, concentration_ng_ul, total_volume_ul, a260_280, notes)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	);

	const extractData = [
		{ key: 'sewage_01_x', sample: 'sewage_01', name: 'MCGK-SEW-001-DNA', date: '1927-03-12', method: 'Phenol-chloroform', type: 'DNA', conc: 42.5, vol: 50, ratio: 1.85 },
		{ key: 'sewage_02_x', sample: 'sewage_02', name: 'MCGK-SEW-002-DNA', date: '1927-03-19', method: 'Phenol-chloroform', type: 'DNA', conc: 38.1, vol: 50, ratio: 1.82 },
		{ key: 'river_01_x', sample: 'river_01', name: 'MCGK-ER-001-DNA', date: '1927-03-12', method: 'Phenol-chloroform', type: 'DNA', conc: 12.3, vol: 50, ratio: 1.78, notes: 'Low yield — expected for filtered river water.' },
		{ key: 'river_02_x', sample: 'river_02', name: 'MCGK-ER-002-DNA', date: '1927-04-16', method: 'Phenol-chloroform', type: 'DNA', conc: 15.7, vol: 50, ratio: 1.80 },
		{ key: 'harbor_01_x', sample: 'harbor_01', name: 'STH-BW-001-DNA', date: '1927-08-07', method: 'Phenol-chloroform', type: 'DNA', conc: 28.4, vol: 40, ratio: 1.76, notes: 'Extracted in field conditions. Centrifuge powered by ship generator.' },
		{ key: 'harbor_02_x', sample: 'harbor_02', name: 'STH-BW-002-DNA', date: '1927-08-07', method: 'Bead-beating + column', type: 'DNA', conc: 55.2, vol: 40, ratio: 1.88 },
		{ key: 'dogtail_01_x', sample: 'dogtail_01', name: 'STH-DT-001-DNA', date: '1927-08-14', method: 'Bead-beating + column', type: 'DNA', conc: 61.0, vol: 40, ratio: 1.90 },
		{ key: 'spring_01_x', sample: 'spring_01', name: 'STH-SP-001-DNA', date: '1927-08-17', method: 'Phenol-chloroform', type: 'DNA', conc: 8.5, vol: 40, ratio: 1.72, notes: 'Very low biomass. May need nested PCR.' },
		{ key: 'elk_01_x', sample: 'elk_01', name: 'ZEN-ELK-001-DNA', date: '1926-06-25', method: 'Bead-beating + column', type: 'DNA', conc: 78.3, vol: 50, ratio: 1.92 },
		{ key: 'elk_02_x', sample: 'elk_02', name: 'ZEN-ELK-002-DNA', date: '1926-06-25', method: 'Bead-beating + column', type: 'DNA', conc: 45.6, vol: 50, ratio: 1.87 },
		{ key: 'river_s01_x', sample: 'river_s01', name: 'ZEN-RIV-001-DNA', date: '1926-06-26', method: 'Phenol-chloroform', type: 'DNA', conc: 18.9, vol: 50, ratio: 1.79 },
		{ key: 'prairie_01_x', sample: 'prairie_01', name: 'ZEN-WH-001-DNA', date: '1926-07-08', method: 'Bead-beating + column', type: 'DNA', conc: 95.1, vol: 50, ratio: 1.94, notes: 'Exceptional yield from prairie topsoil. Rich humic fraction.' },
	];

	for (const e of extractData) {
		const eid = id();
		extracts[e.key] = eid;
		insertExtract.run(eid, LAB_ID, samples[e.sample], e.name, e.date, e.method, e.type, e.conc, e.vol, e.ratio, e.notes ?? null);
	}

	// ============================================================
	// PCR PLATES + AMPLIFICATIONS
	// ============================================================
	const pcrPlates = {};
	const insertPcrPlate = db.prepare(
		`INSERT INTO pcr_plates (id, lab_id, plate_name, pcr_date, forward_primer_name, forward_primer_seq, reverse_primer_name, reverse_primer_seq, annealing_temp_c, num_cycles, notes)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	);
	const insertPcrAmp = db.prepare(
		`INSERT INTO pcr_amplifications (id, lab_id, plate_id, extract_id, pcr_name, well_label, pcr_date, band_observed, concentration_ng_ul, notes)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	);

	// Plate 1: 16S survey of phage project
	const plate1Id = id();
	pcrPlates['phage_16s'] = plate1Id;
	insertPcrPlate.run(plate1Id, LAB_ID, 'MCGK-16S-Plate01', '1927-03-20', '515F', 'GTGYCAGCMGCCGCGGTAA', '806R', 'GGACTACNVGGGTWTCTAAT', 55.0, 30, '16S V4 survey of NYC sewage + river samples');

	const plate1Amps = [
		{ extract: 'sewage_01_x', name: 'MCGK-SEW-001-16S', well: 'A1', band: 1, conc: 22.0 },
		{ extract: 'sewage_02_x', name: 'MCGK-SEW-002-16S', well: 'A2', band: 1, conc: 19.5 },
		{ extract: 'river_01_x', name: 'MCGK-ER-001-16S', well: 'A3', band: 1, conc: 8.2, notes: 'Faint band — low template.' },
		{ extract: 'river_02_x', name: 'MCGK-ER-002-16S', well: 'A4', band: 1, conc: 10.1 },
	];
	for (const a of plate1Amps) {
		insertPcrAmp.run(id(), LAB_ID, plate1Id, extracts[a.extract], a.name, a.well, '1927-03-20', a.band, a.conc, a.notes ?? null);
	}

	// Plate 2: 16S survey of plague project
	const plate2Id = id();
	pcrPlates['plague_16s'] = plate2Id;
	insertPcrPlate.run(plate2Id, LAB_ID, 'STH-16S-Plate01', '1927-08-20', '515F', 'GTGYCAGCMGCCGCGGTAA', '806R', 'GGACTACNVGGGTWTCTAAT', 55.0, 30, '16S V4 survey of St. Hubert field samples');

	const plate2Amps = [
		{ extract: 'harbor_01_x', name: 'STH-BW-001-16S', well: 'A1', band: 1, conc: 18.3 },
		{ extract: 'harbor_02_x', name: 'STH-BW-002-16S', well: 'A2', band: 1, conc: 25.7 },
		{ extract: 'dogtail_01_x', name: 'STH-DT-001-16S', well: 'A3', band: 1, conc: 30.2 },
		{ extract: 'spring_01_x', name: 'STH-SP-001-16S', well: 'A4', band: 0, conc: null, notes: 'No band. Re-amplify with 45 cycles.' },
		{ extract: 'spring_01_x', name: 'STH-SP-001-16S-r2', well: 'B4', band: 1, conc: 5.1, notes: 'Repeat with 45 cycles — faint band.' },
	];
	for (const a of plate2Amps) {
		insertPcrAmp.run(id(), LAB_ID, plate2Id, extracts[a.extract], a.name, a.well, '1927-08-20', a.band, a.conc ?? null, a.notes ?? null);
	}

	// Plate 3: 16S for soil project
	const plate3Id = id();
	pcrPlates['soil_16s'] = plate3Id;
	insertPcrPlate.run(plate3Id, LAB_ID, 'ZEN-16S-Plate01', '1926-07-15', '515F', 'GTGYCAGCMGCCGCGGTAA', '806R', 'GGACTACNVGGGTWTCTAAT', 55.0, 30, '16S V4 survey of Zenith region soil + water');

	const plate3Amps = [
		{ extract: 'elk_01_x', name: 'ZEN-ELK-001-16S', well: 'A1', band: 1, conc: 35.0 },
		{ extract: 'elk_02_x', name: 'ZEN-ELK-002-16S', well: 'A2', band: 1, conc: 28.4 },
		{ extract: 'river_s01_x', name: 'ZEN-RIV-001-16S', well: 'A3', band: 1, conc: 12.8 },
		{ extract: 'prairie_01_x', name: 'ZEN-WH-001-16S', well: 'A4', band: 1, conc: 40.2, notes: 'Strong band. Prairie soil is rich.' },
	];
	for (const a of plate3Amps) {
		insertPcrAmp.run(id(), LAB_ID, plate3Id, extracts[a.extract], a.name, a.well, '1926-07-15', a.band, a.conc, a.notes ?? null);
	}

	// ============================================================
	// LIBRARY PLATES + PREPS
	// ============================================================
	const insertLibPlate = db.prepare(
		`INSERT INTO library_plates (id, lab_id, plate_name, library_prep_date, library_type, library_source, library_selection, library_prep_kit, platform, instrument_model, pcr_plate_id, notes)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	);
	const insertLibPrep = db.prepare(
		`INSERT INTO library_preps (id, lab_id, library_plate_id, pcr_id, library_name, well_label, library_type, library_source, library_selection, library_prep_kit, platform, instrument_model, index_sequence_i7, barcode)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	);

	// Library plate for soil project (the most complete pipeline)
	const libPlateId = id();
	insertLibPlate.run(libPlateId, LAB_ID, 'ZEN-LIB-Plate01', '1926-07-20', 'AMPLICON', 'METAGENOMIC', 'PCR', 'Nextera XT', 'ILLUMINA', 'Illumina MiSeq', plate3Id, 'Illumina library prep of Zenith 16S amplicons');

	// Get PCR amp IDs for the soil plate
	const soilAmps = db.prepare(
		'SELECT id, pcr_name, well_label FROM pcr_amplifications WHERE plate_id = ? ORDER BY well_label'
	).all(plate3Id);

	const indexSeqs = ['ATCACG', 'CGATGT', 'TTAGGC', 'TGACCA'];
	const barcodes = ['BC01', 'BC02', 'BC03', 'BC04'];
	for (let i = 0; i < soilAmps.length; i++) {
		const amp = soilAmps[i];
		insertLibPrep.run(id(), LAB_ID, libPlateId, amp.id,
			amp.pcr_name.replace('-16S', '-LIB'), amp.well_label,
			'AMPLICON', 'METAGENOMIC', 'PCR', 'Nextera XT',
			'ILLUMINA', 'Illumina MiSeq', indexSeqs[i], barcodes[i]
		);
	}

	// ============================================================
	// SEQUENCING RUN
	// ============================================================
	const insertRun = db.prepare(
		`INSERT INTO sequencing_runs (id, lab_id, run_name, run_date, platform, instrument_model, flow_cell_id, total_reads, total_bases, notes)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	);
	const insertRunLib = db.prepare(
		'INSERT INTO run_libraries (run_id, library_id, read_count) VALUES (?, ?, ?)'
	);

	const runId = id();
	insertRun.run(runId, LAB_ID, 'ZEN-MiSeq-Run01', '1926-08-01', 'ILLUMINA', 'Illumina MiSeq', 'FCB-000142', 2400000, 720000000, 'Zenith Region 16S V4 amplicon survey. 2×300 bp paired-end. Gottlieb PI.');

	const libs = db.prepare('SELECT id FROM library_preps WHERE library_plate_id = ?').all(libPlateId);
	const readCounts = [680000, 550000, 420000, 750000];
	for (let i = 0; i < libs.length; i++) {
		insertRunLib.run(runId, libs[i].id, readCounts[i]);
	}

	// ============================================================
	// ENTITY PERSONNEL (attribute people to entities)
	// ============================================================
	const insertEP = db.prepare(
		`INSERT INTO entity_personnel (entity_type, entity_id, personnel_id, role, sort_order)
		 VALUES (?, ?, ?, ?, ?)`
	);

	// Arrowsmith as collector on phage samples
	insertEP.run('sample', samples['sewage_01'], personnel['arrowsmith'], 'collector', 0);
	insertEP.run('sample', samples['river_01'], personnel['arrowsmith'], 'collector', 0);
	insertEP.run('sample', samples['river_02'], personnel['leora'], 'collector', 0);
	// Sondelius as collector on plague harbor samples
	insertEP.run('sample', samples['harbor_01'], personnel['sondelius'], 'collector', 0);
	insertEP.run('sample', samples['harbor_02'], personnel['sondelius'], 'collector', 0);
	// Gottlieb and Wickett on soil project
	insertEP.run('sample', samples['elk_01'], personnel['gottlieb'], 'collector', 0);
	insertEP.run('sample', samples['elk_02'], personnel['gottlieb'], 'collector', 0);
	insertEP.run('sample', samples['river_s01'], personnel['wickett'], 'collector', 0);
	insertEP.run('sample', samples['prairie_01'], personnel['arrowsmith'], 'collector', 0);

	// Wickett as PCR operator
	insertEP.run('pcr_plate', plate1Id, personnel['wickett'], 'pcr operator', 0);
	insertEP.run('pcr_plate', plate2Id, personnel['arrowsmith'], 'pcr operator', 0);
	insertEP.run('pcr_plate', plate3Id, personnel['wickett'], 'pcr operator', 0);

	// Leora on library prep
	insertEP.run('library_plate', libPlateId, personnel['leora'], 'library prep', 0);

	// Run attributed to Gottlieb
	insertEP.run('sequencing_run', runId, personnel['gottlieb'], 'supervisor', 0);

	return {
		personnel: people.length,
		projects: projData.length,
		sites: siteData.length,
		samples: sampleData.length,
		extracts: extractData.length,
		pcrPlates: 3,
		pcrAmps: plate1Amps.length + plate2Amps.length + plate3Amps.length,
		libPlates: 1,
		libPreps: soilAmps.length,
		runs: 1,
	};
});

const counts = tx();
console.log('McGurk Institute demo data seeded:');
for (const [k, v] of Object.entries(counts)) {
	console.log(`  ${k}: ${v}`);
}
