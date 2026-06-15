#!/usr/bin/env node
/**
 * clean-mastersheet.mjs
 *
 * Reads the legacy DNA master spreadsheet and emits a MIxS-shaped TSV that can
 * be uploaded via the /export import page.
 *
 * Usage:
 *   node scripts/clean-mastersheet.mjs <input.xlsx> <output.tsv>
 *
 * What it does per row:
 *   - Canonicalizes Project → project_name via PROJECT_MAP below
 *   - Fixes Excel date-corrupted Churchill station codes (1-Jan → 1-1, etc.)
 *   - Joins Station code against the codes_stations sheet to fill lat/lon when
 *     the row's own lat/lon is blank
 *   - Normalizes dates: YYYYMMDD, 28-May-24, 5/28/24, and year-only → YYYY-MM-DD
 *     (year-only becomes YYYY, which MIxS permits via right-truncation)
 *   - Normalizes depths: surface/0m/0 → 0, 5m → 5, bottom/deep/MID → blank+note
 *   - Synthesizes samp_name when blank: {project_slug}_{box}_{slot}
 *   - Splits extract-level columns off into extract_* fields so the importer
 *     creates an extract row alongside each sample
 *
 * What it reports:
 *   - A warnings list at stderr: unmapped projects, unknown stations, bad dates
 *   - Row-level rejects (fail to parse the minimum: samp_name + project + date)
 *
 * Everything in PROJECT_MAP / STATION_FIX / DEPTH_MAP is hand-curated — edit
 * those objects, don't try to automate them. The script is deterministic so
 * you can diff two runs when you tweak the maps.
 */

import * as XLSX from 'xlsx';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------
// Hand-curated canonicalization maps — edit these in place.
// ---------------------------------------------------------------

/** Project name canonicalization. Keys are raw sheet values; values are the
 *  canonical name to write to the TSV. Names NOT in this map pass through. */
const PROJECT_MAP = {
	// Namao variants
	'Namao_2022': 'Namao 2022',
	'Namao_2024': 'Namao 2024',
	'Namao 2024 North Basin': 'Namao 2024',
	'Namao 2024 South Basin': 'Namao 2024',
	'Namao 2025 North Basin': 'Namao 2025',
	'Namao Field Course 2025': 'Namao Field Course 2025',
	// Poplar River
	'PoplarRiver': 'Poplar River',
	// CMO MOS cultures
	'MOS cultures in BH': 'CMO MOS',
	// Confirmed merges (typo dupes)
	'CEP_CO': 'CEP-CO',
	'QEI  2025': 'QEI 2025',       // double-space variant, 1 row
	'GENICE 2024': 'GENICE II 2024',
	'Churchill': 'Churchill River Incubation 2024',
	// AN17 triplets — station-desc text landed in Project column.
	// All map to Amundsen 2017 (the cruise that underlies AN17* data).
	'AN17 Leg26 Cast 65 Stn 323': 'Amundsen 2017',
	'AN17.265 st 323 <3mm': 'Amundsen 2017',
	'AN17.2134 st A16 <3mm': 'Amundsen 2017',
	// GENICE II variants
	'GENICE II': 'GENICE II',
	'GENICE II 2024': 'GENICE II 2024',
	// Chesterfield Inlet
	'ChesterfieldInlet': 'Chesterfield Inlet',
	'Chesterfield Inlet 2025': 'Chesterfield Inlet 2025',
	// Unknowns get their own bucket so you can revisit them later
	'Unknown': 'Unknown',
	'Unknown 2022': 'Unknown 2022',
	'Unknown 2022 Cruise': 'Unknown 2022 Cruise'
};

/** Excel date-corrupted station codes. All 63 rows are from Churchill River
 *  Incubation 2024, confirmed via notebook check: CMO_INCUB_2_2_1 → station 2-2
 *  → Excel auto-formatted as 2-Feb. Full 9-entry grid below. */
const STATION_FIX = {
	'1-Jan': '1-1', '2-Jan': '2-1', '3-Jan': '3-1',
	'1-Feb': '1-2', '2-Feb': '2-2', '3-Feb': '3-2',
	'1-Mar': '1-3', '2-Mar': '2-3', '3-Mar': '3-3'
};

/** Depth vocabulary normalization. Maps raw Depth values to numeric meters
 *  (as strings, since the MIxS depth slot accepts strings). Unknowns are
 *  passed through verbatim and surface in the sheet for manual cleanup. */
const DEPTH_MAP = {
	'surface': '0', 'Surface': '0', '0': '0', '0m': '0',
	'bottom': '', 'Bottom': '', 'deep': '', 'MID': '',
	'NaN': '', 'NA': '', 'N/A': '', 'nan': ''
};

/** Fallback: when the Project column is blank, infer the project from the
 *  physical storage Box label. User-confirmed mappings only. Unlisted boxes
 *  fall through as DROPPED with a warning so nothing is silently miscategorized. */
const BOX_TO_PROJECT = {
	'MB Watershed 2024 Box 1': 'Watershed',
	'Dristi Spring 2026': 'Watershed',
	'Olivia Fall 2025': 'Watershed',   // NLM-* samples
	'Olivia, Sophie, Grace #2': 'Namao 2025'
};

// ---------------------------------------------------------------
// Input/output
// ---------------------------------------------------------------

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
	console.error('Usage: node scripts/clean-mastersheet.mjs <input.xlsx> <output.tsv>');
	process.exit(1);
}

const wb = XLSX.read(readFileSync(inputPath), { type: 'buffer' });
const dnaSheet = wb.Sheets['DNA'];
const stationsSheet = wb.Sheets['codes_stations'];
if (!dnaSheet || !stationsSheet) {
	console.error('Workbook must have DNA and codes_stations sheets.');
	process.exit(1);
}

const dnaRows = XLSX.utils.sheet_to_json(dnaSheet, { raw: false, defval: '' });
const stationRows = XLSX.utils.sheet_to_json(stationsSheet, { raw: false, defval: '' });

// Build station_code → {lat, lon, name} map
const STATION_COORDS = new Map();
for (const r of stationRows) {
	const code = String(r.Code || '').trim();
	if (!code) continue;
	const lat = parseFloat(r.Latitude);
	const lon = parseFloat(r.Longitude);
	STATION_COORDS.set(code, {
		name: String(r.Name || '').trim(),
		lat: isNaN(lat) ? null : lat,
		lon: isNaN(lon) ? null : lon
	});
}

/** Station codes sorted longest-first, for prefix matching against sample_name
 *  when the Station column itself is blank or unrecognized. Longest-first so
 *  `SNCB` wins over `SN` (both would match "SNCB_..."). */
const STATION_CODES_BY_LENGTH = [...STATION_COORDS.keys()].sort((a, b) => b.length - a.length);

/** Try to extract a known station code from a sample_name like "CHDR_RDR_20251113"
 *  or "20250702_AER_Forks". Looks for codes at word boundaries to avoid partial
 *  matches inside longer identifiers. Returns null if nothing matches. */
function stationFromSampleName(sampName) {
	if (!sampName) return null;
	for (const code of STATION_CODES_BY_LENGTH) {
		const re = new RegExp('(?:^|[._\\-\\s])' + code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:$|[._\\-\\s])');
		if (re.test(sampName)) return code;
	}
	return null;
}

// ---------------------------------------------------------------
// Per-row helpers
// ---------------------------------------------------------------

/** Normalize a date string to YYYY-MM-DD (or YYYY for year-only). Returns '' if unparseable. */
function normalizeDate(raw) {
	const s = String(raw || '').trim();
	if (!s) return '';
	// YYYYMMDD (no separators)
	let m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
	if (m) return `${m[1]}-${m[2]}-${m[3]}`;
	// 28-May-24 / 5-Jun-24
	m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/.exec(s);
	if (m) {
		const months = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
			jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
		const mm = months[m[2].toLowerCase()];
		if (!mm) return '';
		const dd = m[1].padStart(2, '0');
		let yyyy = m[3];
		if (yyyy.length === 2) yyyy = '20' + yyyy;
		return `${yyyy}-${mm}-${dd}`;
	}
	// 5/28/24 or 05/28/2024 — assume M/D/Y (North American convention)
	m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
	if (m) {
		const mm = m[1].padStart(2, '0');
		const dd = m[2].padStart(2, '0');
		let yyyy = m[3];
		if (yyyy.length === 2) yyyy = '20' + yyyy;
		return `${yyyy}-${mm}-${dd}`;
	}
	// Year only (2024)
	if (/^\d{4}$/.test(s)) return s;
	// YYMMDD (6 digits)
	m = /^(\d{2})(\d{2})(\d{2})$/.exec(s);
	if (m) return `20${m[1]}-${m[2]}-${m[3]}`;
	return '';
}

/** Produce a SampleTown-safe samp_name (a-zA-Z0-9_.-). */
function sanitizeName(raw) {
	return String(raw || '').trim().replace(/[^a-zA-Z0-9_.\-]/g, '.');
}

function slug(s) {
	return sanitizeName(s).replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
}

// ---------------------------------------------------------------
// Output column order (MIxS-shaped TSV header)
// ---------------------------------------------------------------

/** Column order matches the MIxS 6.3.0 MimarksSWater template the app emits
 *  via /api/mixs/template. Required slots come first so validation errors are
 *  maximally actionable. SampleTown-local columns (site_name, latitude,
 *  longitude, extract_*, misc_param:*) follow — the parser composes lat_lon
 *  from lat+lon and routes the rest to their owning tables. */
const OUT_COLS = [
	// MIxS required (12 — per MimarksSWater class)
	'samp_name', 'env_broad_scale', 'project_name', 'env_local_scale',
	'depth', 'env_medium', 'samp_taxon_id', 'geo_loc_name',
	'collection_date', 'seq_meth', 'lat_lon', 'target_gene',
	// SampleTown-local site helpers — parser composes lat_lon if that col is blank
	'site_code', 'site_name', 'latitude', 'longitude',
	// MIxS optional we have values for
	'temp', 'samp_size', 'size_frac',
	// Sample notes
	'notes',
	// MIxS slots we have per-row values for
	'air_temp',
	// Misc params (routed to sample_values EAV).
	// `legacy_row_id` is the SHA-1-based provenance token that ties each imported
	// sample back to a row in the legacy master spreadsheet — see the audit xlsx.
	'misc_param:legacy_row_id',
	'misc_param:collection_time', 'misc_param:nanopore',
	// Extract fields (SampleTown-local; importer routes to extracts table)
	'extract_name', 'extraction_date', 'concentration_ng_ul',
	'storage_box', 'storage_location', 'extract_notes'
];

/** Project-level defaults for MIxS required slots we can't derive per-sample.
 *  Sites in other projects will default to "not provided" placeholders (valid
 *  INSDC missing-value strings) so rows still pass required-slot presence
 *  checks. Update this map as more projects are characterized. */
const PROJECT_DEFAULTS = {
	'Watershed': {
		env_broad_scale: 'aquatic biome [ENVO:00002030]',
		env_local_scale: 'freshwater river biome [ENVO:01000253]', // most samples are rivers; lakes overridden below
		geo_loc_name: 'Canada: Manitoba',
		samp_taxon_id: '1169740', // NCBI:txid1169740 = aquatic metagenome
		seq_meth: 'not provided',
		target_gene: '16S rRNA'
	}
};

/** Very light env_local_scale refinement: if the site name contains "lake"
 *  or "FWA" (Fort Whyte Alive ponds) we use the lake biome term. */
function envLocalScale(projectName, siteName) {
	const def = PROJECT_DEFAULTS[projectName]?.env_local_scale ?? 'not provided';
	if (/lake|FWA/i.test(String(siteName || ''))) {
		return 'lake biome [ENVO:00000020]';
	}
	return def;
}

/** Churchill MB region filter: the 2025-2026 sheet pulled in some CMO/
 *  Hudson Bay samples (lat > 55) under project=Watershed. Those belong to
 *  a different project and should be dropped from Watershed imports. */
function isChurchillRegion(lat) {
	return lat != null && !isNaN(lat) && Number(lat) > 55;
}

/** Deterministic 12-hex-char id from the legacy row's identifying columns.
 *  Stable across re-runs so the audit xlsx can be regenerated without
 *  invalidating previous back-references. */
function legacyRowId(r, excelRow) {
	const key = [
		excelRow,
		r.Project, r.Date_collected, r.Sample_name, r.Station,
		r.Box, r.Slot, r.Tube_label
	].map((v) => String(v ?? '')).join('|');
	return createHash('sha1').update(key).digest('hex').slice(0, 12);
}

/** Year-from-project-name fallback for rows with no collection_date.
 *  "Namao 2022" → "2022"; "Unknown 2022 Cruise" → "2022". MIxS permits
 *  right-truncated dates (YYYY), so year-only is a valid collection_date. */
function projectYear(name) {
	const m = /(?:^|[\s_-])(\d{4})(?:$|[\s_-])/.exec(String(name || ''));
	return m ? m[1] : '';
}

const warnings = [];
const warn = (msg) => warnings.push(msg);
const unknownStations = new Set();
const unknownProjects = new Set();

// ---------------------------------------------------------------
// Row loop — every row is kept; provenance tracked via audit[]
// ---------------------------------------------------------------

const outRows = [];
/** Audit row per input row; written out as a standalone xlsx for cross-ref. */
const audit = [];
let droppedRows = 0;      // rows that can't even be emitted (no project AND no name)
let dateFallbacks = 0;    // rows where we used project-year instead of a real date
let dateMissing = 0;      // rows where date is completely unrecoverable

dnaRows.forEach((r, i) => {
	const excelRow = i + 2; // header is row 1
	const legacy_id = legacyRowId(r, excelRow);
	const rowWarnings = [];

	// Project canonicalization, with a box-label fallback for rows whose Project
	// column is blank but whose physical storage box makes the project obvious.
	const rawProject = String(r.Project || '').trim();
	const rawBox = String(r.Box || '').trim();
	let projectName = rawProject ? (PROJECT_MAP[rawProject] ?? rawProject) : '';
	if (!projectName && rawBox && BOX_TO_PROJECT[rawBox]) {
		projectName = BOX_TO_PROJECT[rawBox];
		rowWarnings.push(`project inferred from box "${rawBox}"`);
	}
	if (rawProject && !(rawProject in PROJECT_MAP)) unknownProjects.add(rawProject);

	// Date — try parse, else fall back to year-from-project
	let date = normalizeDate(r.Date_collected);
	if (!date) {
		const py = projectYear(projectName);
		if (py) {
			date = py;
			dateFallbacks++;
			rowWarnings.push(`date missing, using project year ${py}`);
		} else {
			dateMissing++;
			rowWarnings.push('date unrecoverable');
		}
	}

	// Station + coords — apply Excel fix first, then look up
	let station = String(r.Station || '').trim();
	if (STATION_FIX[station]) station = STATION_FIX[station];
	let stationInfo = station ? STATION_COORDS.get(station) : null;
	if (station && !stationInfo) unknownStations.add(station);

	let lat = parseFloat(r.Latitude);
	let lon = parseFloat(r.Longitude);
	if (isNaN(lat)) lat = stationInfo?.lat ?? null;
	if (isNaN(lon)) lon = stationInfo?.lon ?? null;

	// Fallback: if we still have no coords AND the row has a Sample_name, look
	// for a known station code embedded as a prefix/suffix/token in the name.
	// Recovers cases like "CHDR_RDR_20251113" where the Station column was blank.
	if (lat == null || lon == null) {
		const rawSamp = String(r.Sample_name || '').trim();
		const codeFromName = stationFromSampleName(rawSamp);
		if (codeFromName) {
			const info = STATION_COORDS.get(codeFromName);
			if (info && info.lat != null && info.lon != null) {
				if (lat == null) lat = info.lat;
				if (lon == null) lon = info.lon;
				if (!station) station = codeFromName;
				if (!stationInfo) stationInfo = info;
				rowWarnings.push(`coords recovered from sample_name prefix "${codeFromName}"`);
			}
		}
	}

	// Sample name — synthesize when blank. We need at least 2 distinguishing
	// parts (beyond project_name) to avoid every blank-Sample_name row in the
	// same project collapsing to the same synthesized value.
	let sampName = String(r.Sample_name || '').trim();
	if (!sampName) {
		const box = slug(String(r.Box || '').trim());
		const slot = slug(String(r.Slot || '').trim());
		const tube = slug(String(r.Tube_label || '').trim());
		const parts = [slug(projectName), box, slot || tube].filter(Boolean);
		// If we have project + (box or slot), those two together are usually
		// unique. Otherwise append the Excel row number as a last-resort
		// disambiguator so the UNIQUE(project_id, samp_name) constraint holds.
		sampName = parts.length >= 2 ? parts.join('_') : [...parts, `r${excelRow}`].filter(Boolean).join('_');
		if (!sampName) sampName = `row${excelRow}`;
	}
	sampName = sanitizeName(sampName);
	if (!sampName || !projectName) {
		// No project name AND no usable sample name → nothing we can import.
		droppedRows++;
		audit.push({ ...r, excel_row: excelRow, legacy_id,
			status: 'DROPPED', new_samp_name: '', new_project: projectName,
			new_site: '', new_lat: '', new_lon: '', new_date: date,
			warnings: (rowWarnings.concat(['missing project and/or synthesizable name'])).join(' | ') });
		return;
	}

	// Depth
	const rawDepth = String(r.Depth || '').trim();
	let depth = '';
	if (rawDepth in DEPTH_MAP) depth = DEPTH_MAP[rawDepth];
	else {
		const m = /^(\d+(?:\.\d+)?)\s*m?$/.exec(rawDepth);
		if (m) depth = m[1];
		else if (rawDepth) warn(`row ${excelRow} ${sampName}: unrecognized depth "${rawDepth}", left blank`);
	}

	// Volume and filter size — MIxS strings with units
	const vol = String(r.Water_volume_ml || '').trim();
	const sampSize = vol ? `${vol} ml` : '';
	const filt = String(r['Filter_size_μm'] || '').trim();
	let sizeFrac = '';
	if (filt) {
		const n = parseFloat(filt);
		if (!isNaN(n)) sizeFrac = `${n} µm`;
		else warn(`row ${excelRow} ${sampName}: non-numeric filter size "${filt}", left blank`);
	}

	// Temperatures
	const waterTemp = String(r.Water_temp_C || '').trim();
	const ambientTemp = String(r.Ambient_temp_C || '').trim();

	// Extract side
	const box = String(r.Box || '').trim();
	const slot = String(r.Slot || '').trim();
	const tube = String(r.Tube_label || '').trim();
	const dnaConc = String(r.DNA_conc || '').trim();
	const extDate = normalizeDate(r.Date_extracted);
	const extBy = String(r.Extracted_by || '').trim();
	// Extract name: prefer tube_label, fall back to box+slot
	const extractName = tube || (box && slot ? `${slug(box)}_${slot}` : '');
	// Extract notes: carry Extracted_by here (no dedicated column in extracts).
	// Sample-level notes stay on the sample.
	const extractNotes = extBy ? `extracted_by: ${extBy}` : '';

	// Drop Churchill-region rows that got mis-labeled as Watershed in the
	// source spreadsheet (CMO/CLR samples in the 2025-2026 sheet, plus any
	// legacy rows above 55°N).
	if (projectName === 'Watershed' && isChurchillRegion(lat)) {
		audit.push({ ...r, excel_row: excelRow, legacy_id,
			status: 'DROPPED_CHURCHILL_REGION',
			new_project: projectName, new_site: stationInfo?.name || station || '',
			new_lat: lat, new_lon: lon, new_date: date,
			warnings: 'lat>55 in Watershed project — likely CMO sample, dropped' });
		return;
	}

	const defaults = PROJECT_DEFAULTS[projectName] ?? {};
	// site_code is the short, strict identifier (from Station column or
	// codes_stations.Code). site_name is the full display name from
	// codes_stations.Name when we have a match, else falls back to the station
	// string for visibility.
	const siteCode = station || '';
	const siteName = stationInfo?.name || station || '';
	const samp = {
		// MIxS required — filled from defaults where we don't have a per-sample value
		samp_name: sampName,
		env_broad_scale: defaults.env_broad_scale ?? 'not provided',
		project_name: projectName,
		env_local_scale: envLocalScale(projectName, siteName),
		depth: depth || 'not collected',
		env_medium: 'water',
		samp_taxon_id: defaults.samp_taxon_id ?? 'not provided',
		geo_loc_name: defaults.geo_loc_name ?? 'not provided',
		collection_date: date,
		seq_meth: defaults.seq_meth ?? 'not provided',
		lat_lon: '', // composed from latitude+longitude by parseMixsTsv
		target_gene: defaults.target_gene ?? 'not provided',
		// Site helpers
		site_code: siteCode,
		site_name: siteName,
		latitude: lat != null ? String(lat) : '',
		longitude: lon != null ? String(lon) : '',
		// MIxS optional we have values for
		temp: waterTemp,
		samp_size: sampSize,
		size_frac: sizeFrac,
		// Sample notes
		notes: String(r.Notes || '').trim(),
		// MIxS slots: air_temp is the canonical slot for ambient temperature
		air_temp: ambientTemp,
		'misc_param:legacy_row_id': legacy_id,
		'misc_param:collection_time': String(r.Time || '').trim(),
		'misc_param:nanopore': /^y$/i.test(String(r.Nanopore || '').trim()) ? 'yes' : '',
		extract_name: extractName,
		extraction_date: extDate,
		concentration_ng_ul: dnaConc && !isNaN(parseFloat(dnaConc)) ? dnaConc : '',
		storage_box: box,
		storage_location: slot,
		extract_notes: extractNotes
	};

	outRows.push(samp);

	// Audit record for this row — kept even when a fallback was applied so the
	// user can spot them in the xlsx without re-running the cleaner.
	audit.push({
		...r,
		excel_row: excelRow,
		legacy_id,
		status: (lat != null && lon != null) ? 'CLEARED_WITH_COORDS' : 'CLEARED_NO_COORDS',
		new_samp_name: sampName,
		new_project: projectName,
		new_site: samp.site_name,
		new_lat: samp.latitude,
		new_lon: samp.longitude,
		new_date: date,
		warnings: rowWarnings.join(' | ')
	});
});

// ---------------------------------------------------------------
// Dedup samp_name within each project — the UNIQUE(project_id, samp_name)
// index means duplicates on the same project will fail insert. Strategy:
//   1st occurrence  → keep as-is
//   2nd+ occurrence → append collection_date; if that also collides, append
//                     a running counter (e.g. "SNCB_2024-05-28_2").
// This is deterministic across reruns because we iterate in emission order.
// ---------------------------------------------------------------

{
	const seen = new Map(); // "project_name\tsamp_name" → count
	const dupBumped = [];   // warnings about auto-disambiguation
	for (const row of outRows) {
		const base = row.samp_name;
		const key = row.project_name + '\t' + base;
		const n = (seen.get(key) || 0) + 1;
		seen.set(key, n);
		if (n === 1) continue;
		const withDate = sanitizeName(`${base}_${row.collection_date}`);
		const dateKey = row.project_name + '\t' + withDate;
		if (!seen.has(dateKey)) {
			row.samp_name = withDate;
			seen.set(dateKey, 1);
			dupBumped.push(`${base} → ${withDate} (disambiguated by date)`);
		} else {
			const dateCount = (seen.get(dateKey) || 0) + 1;
			seen.set(dateKey, dateCount);
			const withCounter = sanitizeName(`${withDate}_${dateCount}`);
			row.samp_name = withCounter;
			dupBumped.push(`${base} → ${withCounter} (disambiguated by date+counter)`);
			// Update the synthesized extract_name to track
			if (row.extract_name && row.extract_name.startsWith(base)) {
				row.extract_name = withCounter + '_ext';
			}
		}
	}
	if (dupBumped.length > 0) {
		// Unshift rather than push — dedup is a headline fact about the run,
		// not another row-level note, and the warnings list is truncated at 50.
		warnings.unshift(`Dedup'd ${dupBumped.length} duplicate samp_name(s) by appending collection_date` +
			(dupBumped.length <= 10 ? ': ' + dupBumped.join('; ') : ''));
	}
}

// ---------------------------------------------------------------
// Serialize TSV
// ---------------------------------------------------------------

function escTsv(v) {
	const s = String(v ?? '');
	if (s.includes('\t') || s.includes('\n') || s.includes('"')) {
		return '"' + s.replace(/"/g, '""') + '"';
	}
	return s;
}

const lines = [];
lines.push(OUT_COLS.join('\t'));
for (const row of outRows) {
	lines.push(OUT_COLS.map((c) => escTsv(row[c])).join('\t'));
}
// Prepend UTF-8 BOM (﻿) so Excel-for-Mac auto-detects UTF-8 instead of
// falling back to MacRoman on double-click. The importer strips the BOM.
writeFileSync(outputPath, '﻿' + lines.join('\n') + '\n', 'utf-8');

// Audit xlsx: original columns + legacy_id + status + normalized fields. Path
// is derived from the output path: foo.tsv → foo.audit.xlsx next to it. Uses
// XLSX.write (buffer) + writeFileSync because XLSX.writeFile fails in ESM.
const auditPath = outputPath.replace(/\.tsv$/i, '') + '.audit.xlsx';
const auditWb = XLSX.utils.book_new();
const auditWs = XLSX.utils.json_to_sheet(audit);
XLSX.utils.book_append_sheet(auditWb, auditWs, 'audit');
writeFileSync(auditPath, XLSX.write(auditWb, { type: 'buffer', bookType: 'xlsx' }));

// ---------------------------------------------------------------
// Report
// ---------------------------------------------------------------

const withCoords = outRows.filter((r) => r.latitude && r.longitude).length;
const noCoords = outRows.length - withCoords;

console.error('=== clean-mastersheet report ===');
console.error(`Input:   ${inputPath}`);
console.error(`Output:  ${outputPath}`);
console.error(`Audit:   ${auditPath}`);
console.error(`Rows in: ${dnaRows.length}    Rows out: ${outRows.length}   Dropped: ${droppedRows}`);
console.error(`Coords:  with=${withCoords}  without=${noCoords}`);
console.error(`Dates:   parsed=${outRows.length - dateFallbacks - dateMissing}  project-year fallback=${dateFallbacks}  unrecoverable=${dateMissing}`);
if (unknownProjects.size) {
	console.error(`\nProjects NOT in PROJECT_MAP (passed through verbatim, ${unknownProjects.size}):`);
	for (const p of [...unknownProjects].sort()) console.error(`  - ${p}`);
}
if (unknownStations.size) {
	console.error(`\nStation codes NOT in codes_stations (${unknownStations.size}):`);
	for (const s of [...unknownStations].sort()) console.error(`  - ${s}`);
}
if (warnings.length) {
	console.error(`\nWarnings (${warnings.length}):`);
	for (const w of warnings.slice(0, 50)) console.error(`  - ${w}`);
	if (warnings.length > 50) console.error(`  ... and ${warnings.length - 50} more`);
}
