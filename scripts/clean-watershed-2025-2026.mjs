#!/usr/bin/env node
/**
 * clean-watershed-2025-2026.mjs
 *
 * Cleans the `Sampling Metadata 2025-2026.xlsx` single-sheet spreadsheet into
 * a MIxS TSV suitable for the /export importer. All rows belong to the
 * Watershed project.
 *
 * Layout quirk: row 1 is a group label ("DNA [ ] (ng/µL)"); row 2 holds the
 * actual field names. We read rows 3+ as data against the row-2 headers.
 *
 * Usage:
 *   node scripts/clean-watershed-2025-2026.mjs <input.xlsx> <output.tsv>
 */

import * as XLSX from 'xlsx';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const PROJECT_NAME = 'Watershed';

const [, , inputPath, outputPath, codesPath] = process.argv;
if (!inputPath || !outputPath) {
	console.error('Usage: node scripts/clean-watershed-2025-2026.mjs <input.xlsx> <output.tsv> [codes-xlsx]');
	console.error('  codes-xlsx: optional DNA_Mastersheet xlsx to borrow codes_stations from,');
	console.error('              for code↔display-name lookup. If omitted, uppercase-short values');
	console.error('              in the Site Name column are treated as codes but not enriched.');
	process.exit(1);
}

const wb = XLSX.read(readFileSync(inputPath), { type: 'buffer' });
const ws = wb.Sheets[wb.SheetNames[0]];

/** Load codes from the legacy mastersheet xlsx. We merge `codes_stations`
 *  (current) and `site_codes-old` (legacy/archival) because neither is
 *  complete on its own — the mastersheet actively uses both as reference.
 *  codes_stations wins on collision (it's the active sheet). */
const CODE_LOOKUP = new Map();       // code → display name
const NAME_TO_CODE = new Map();      // normalized name → code
function normName(s) {
	return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
/** Significant tokens for token-set matching: drop words ≤ 2 chars and
 *  generic modifiers that appear in many names ("lake", "park", etc.).
 *  Keeps distinctive tokens like "brereton", "cargill", "boniface". */
const GENERIC_WORDS = new Set(['lake', 'park', 'river', 'the', 'and', 'bay', 'st', 'pt', 'rd', 'dr']);
function significantTokens(s) {
	return normName(s).split(' ').filter((w) => w.length >= 3 && !GENERIC_WORDS.has(w));
}

if (codesPath) {
	const codesWb = XLSX.read(readFileSync(codesPath), { type: 'buffer' });
	// Precedence (last write wins for NAME_TO_CODE collisions):
	//   1. codes_waterbodies — waterbody-level fallback (e.g., whole Bird Lake)
	//   2. site_codes-old    — legacy station list
	//   3. codes_stations    — current active site list
	// Site-level codes override waterbody codes when both exist for a given name.
	for (const sheetName of ['codes_waterbodies', 'site_codes-old', 'codes_stations']) {
		const sh = codesWb.Sheets[sheetName];
		if (!sh) continue;
		for (const r of XLSX.utils.sheet_to_json(sh, { raw: false, defval: '' })) {
			const code = String(r.Code || '').trim();
			if (!code) continue;
			// Sheets use "Name" or "Location" for the display string.
			const name = String(r.Name || r.Location || '').trim();
			CODE_LOOKUP.set(code, name);
			if (name) NAME_TO_CODE.set(normName(name), code);
		}
	}
}

/** Manual aliases for cases where the display-name form in a source sheet
 *  doesn't token-match any codes_stations/site_codes-old row. The Fort Whyte
 *  Alive lakes are named two different ways across sheets; "Falkon" is a
 *  misspelling of "Falcon" we don't want to auto-correct everywhere, just
 *  in the code lookup. */
const MANUAL_SITE_ALIASES = {
	'cargill lake fwa': 'FWLC',
	'devonian lake fwa': 'FWLD',
	'muir lake fwa': 'FWLM',
	'falkon lake': 'FALK'
};

/** Reverse lookup: exact → manual alias → substring → token-set. */
function lookupCodeByName(displayName) {
	const norm = normName(displayName);
	if (!norm) return null;
	if (NAME_TO_CODE.has(norm)) return NAME_TO_CODE.get(norm);
	if (MANUAL_SITE_ALIASES[norm]) return MANUAL_SITE_ALIASES[norm];
	// Substring in either direction (catches "Forks" ⊂ "The Forks", "John
	// Bruce" ⊂ "John Bruce Park"). Skip when the "winning" name is shorter
	// than 4 chars — "pt" matching everything isn't useful.
	for (const [theirNorm, code] of NAME_TO_CODE) {
		if (!theirNorm || theirNorm.length < 4) continue;
		if (theirNorm.includes(norm) || norm.includes(theirNorm)) return code;
	}
	// Token-set: require ≥ 1 distinctive (non-generic) token shared, and the
	// candidate with the most shared distinctive tokens wins. Handles
	// "Cargill Lake FWA" ↔ "FortWhyte Lake Cargill" via the "cargill" token.
	const inputTokens = new Set(significantTokens(displayName));
	if (inputTokens.size === 0) return null;
	let bestCode = null;
	let bestOverlap = 0;
	for (const [theirNorm, code] of NAME_TO_CODE) {
		const theirTokens = significantTokens(theirNorm);
		let overlap = 0;
		for (const t of theirTokens) if (inputTokens.has(t)) overlap++;
		if (overlap > bestOverlap) { bestOverlap = overlap; bestCode = code; }
	}
	return bestOverlap > 0 ? bestCode : null;
}

/** Decide (site_code, site_name) for a "Site Name" input value.
 *  - Short uppercase token matching CODE_SHAPE → treated as a code, display
 *    name pulled from codes_stations if we have it.
 *  - Display name → code reverse-looked-up (fuzzy); if matched we also
 *    replace the site_name with the canonical codes_stations.Name so
 *    clustering doesn't create a "Forks" site AND a "The Forks" site. */
const CODE_SHAPE = /^[A-Z0-9][A-Z0-9_.\-]{1,7}$/;
function splitNameOrCode(raw) {
	const s = String(raw || '').trim();
	if (!s) return { site_code: '', site_name: '' };
	if (CODE_SHAPE.test(s)) {
		const hit = CODE_LOOKUP.get(s);
		return { site_code: s, site_name: hit ?? s };
	}
	const code = lookupCodeByName(s);
	if (code) {
		// Keep the user's preferred display form — the legacy code table uses
		// "FortWhyte Lake Muir" but the lab calls it "Muir Lake FWA" in sheets.
		return { site_code: code, site_name: s };
	}
	return { site_code: '', site_name: s };
}

// Read as 2D array so we can take row 2 as the header row explicitly.
const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
const headerRow = grid[1];
const dataRows = grid.slice(2).filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''));

const hi = {};
headerRow.forEach((h, i) => { hi[String(h).trim()] = i; });
const get = (row, key) => String(row[hi[key]] ?? '').trim();

function normalizeDate(raw) {
	const s = String(raw || '').trim();
	if (!s) return '';
	// 25-Feb-25 / 3-Mar-26
	let m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/.exec(s);
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
	// YYYYMMDD / YYYY-MM-DD passthrough
	m = /^(\d{4})[-/]?(\d{2})[-/]?(\d{2})$/.exec(s);
	if (m) return `${m[1]}-${m[2]}-${m[3]}`;
	return '';
}

function sanitizeName(raw) {
	return String(raw || '').trim().replace(/[^a-zA-Z0-9_.\-]/g, '.');
}

/** Column order matches MIxS 6.3.0 MimarksSWater template (12 required slots
 *  first) then SampleTown-local fields. See clean-mastersheet.mjs for the
 *  matching OUT_COLS definition — they stay aligned across cleaners. */
const OUT_COLS = [
	// MIxS required (12)
	'samp_name', 'env_broad_scale', 'project_name', 'env_local_scale',
	'depth', 'env_medium', 'samp_taxon_id', 'geo_loc_name',
	'collection_date', 'seq_meth', 'lat_lon', 'target_gene',
	// SampleTown-local site helpers
	'site_code', 'site_name', 'latitude', 'longitude',
	// MIxS optional
	'temp', 'samp_size',
	// Notes
	'notes',
	// MIxS slots we have per-row values for (canonical — not misc_param wrappers)
	'air_temp', 'samp_weather',
	// Misc params
	'misc_param:legacy_row_id', 'misc_param:collection_time',
	// Extract fields
	'extract_name', 'concentration_ng_ul', 'storage_box', 'extract_notes'
];

/** Defaults for Watershed (southern MB freshwater). Keep in sync with
 *  clean-mastersheet.mjs PROJECT_DEFAULTS. */
const WATERSHED_DEFAULTS = {
	env_broad_scale: 'aquatic biome [ENVO:00002030]',
	env_local_scale: 'freshwater river biome [ENVO:01000253]',
	geo_loc_name: 'Canada: Manitoba',
	samp_taxon_id: '1169740',
	seq_meth: 'not provided',
	target_gene: '16S rRNA'
};

function envLocalScale(siteName) {
	if (/lake|FWA/i.test(String(siteName || ''))) return 'lake biome [ENVO:00000020]';
	return WATERSHED_DEFAULTS.env_local_scale;
}

function isChurchillRegion(lat) {
	const n = parseFloat(lat);
	return !isNaN(n) && n > 55;
}

/** Canonicalize duplicate site display names so same-physical-location rows
 *  land on ONE site, not two. The 2025-2026 sheet uses two naming conventions
 *  across seasons ("Muir Lake FWA" early, "Fort Whyte Alive Muir Lake" later).
 *  Map both to a single form. Keys are normalized to lowercase for matching. */
const SITE_NAME_MAP = {
	'fort whyte alive muir lake': 'Muir Lake FWA',
	'fort whyte alive cargill lake': 'Cargill Lake FWA',
	'fort whyte alive lake devonian': 'Devonian Lake FWA'
};

function canonicalSiteName(raw) {
	const key = String(raw || '').trim().toLowerCase();
	return SITE_NAME_MAP[key] ?? String(raw || '').trim();
}

function escTsv(v) {
	const s = String(v ?? '');
	if (s.includes('\t') || s.includes('\n') || s.includes('"')) {
		return '"' + s.replace(/"/g, '""') + '"';
	}
	return s;
}

const outRows = [];
const audit = [];
let dropped = 0;

dataRows.forEach((row, i) => {
	const excelRow = i + 3; // row 1 = group label, row 2 = header, data from row 3

	const rawSiteName = get(row, 'Site Name');
	const canon = canonicalSiteName(rawSiteName);
	const { site_code: rowSiteCode, site_name: siteNameFromSplit } = splitNameOrCode(canon);
	const siteName = siteNameFromSplit;
	const date = normalizeDate(get(row, 'Date'));
	const lat = get(row, 'Latitude');
	const lon = get(row, 'Longitude');
	const waterway = get(row, 'River/watershed');
	const time = get(row, 'Hour');
	const ambientTemp = get(row, 'Weather Temperature (C)');
	const climate = get(row, 'Climate');
	const waterTemp = get(row, 'Water Temperature (C)');
	const vol = get(row, 'Volume filtered (ml)');
	const box = get(row, 'Box #');
	const avg = get(row, 'Average');
	const r1 = get(row, '1* repeat');
	const r2 = get(row, '2* repeat');

	if (!siteName || !date) {
		dropped++;
		audit.push({ excel_row: excelRow, status: 'DROPPED', reason: !siteName ? 'no site' : 'no date',
			raw_site: get(row, 'Site Name'), raw_date: get(row, 'Date') });
		return;
	}

	// Drop Churchill/CMO samples that slipped into the Watershed sheet.
	if (isChurchillRegion(lat)) {
		dropped++;
		audit.push({ excel_row: excelRow, status: 'DROPPED_CHURCHILL_REGION',
			reason: `lat ${lat} > 55 — likely CMO sample`,
			raw_site: siteName, raw_date: date });
		return;
	}

	// Build a sample name that's unique per site+date (no Sample_name col here).
	const sampName = sanitizeName(`${siteName}_${date}`);
	const legacy_id = createHash('sha1')
		.update(`${excelRow}|${siteName}|${date}|${box}`)
		.digest('hex').slice(0, 12);

	// DNA concentration: prefer Average; fall back to first non-empty repeat.
	const dnaConc = avg || r1 || r2 || '';
	const extractNotes = [];
	if (r1 && r2 && avg) extractNotes.push(`replicates: ${r1}, ${r2} → avg ${avg}`);

	const samp = {
		// MIxS required
		samp_name: sampName,
		env_broad_scale: WATERSHED_DEFAULTS.env_broad_scale,
		project_name: PROJECT_NAME,
		env_local_scale: envLocalScale(siteName),
		depth: 'not collected',  // surface samples, no explicit depth column
		env_medium: 'water',
		samp_taxon_id: WATERSHED_DEFAULTS.samp_taxon_id,
		geo_loc_name: WATERSHED_DEFAULTS.geo_loc_name,
		collection_date: date,
		seq_meth: WATERSHED_DEFAULTS.seq_meth,
		lat_lon: '', // composed from latitude+longitude by parseMixsTsv
		target_gene: WATERSHED_DEFAULTS.target_gene,
		// Site helpers — splitNameOrCode picks apart code-shaped values in the
		// source sheet's "Site Name" column, optionally enriched by codes_stations
		site_code: rowSiteCode,
		site_name: siteName,
		latitude: lat,
		longitude: lon,
		// MIxS optional
		temp: waterTemp,
		samp_size: vol ? `${vol} ml` : '',
		// Notes
		notes: waterway ? `Waterway: ${waterway}` : '',
		// Canonical MIxS slots (not misc_param wrappers)
		air_temp: ambientTemp,
		samp_weather: climate,
		'misc_param:legacy_row_id': legacy_id,
		'misc_param:collection_time': time,
		// Extracts
		extract_name: `${sampName}_ext`,
		concentration_ng_ul: dnaConc && !isNaN(parseFloat(dnaConc)) ? dnaConc : '',
		storage_box: box,
		extract_notes: extractNotes.join(' | ')
	};
	outRows.push(samp);

	audit.push({
		excel_row: excelRow, status: 'CLEARED', legacy_id,
		new_samp_name: sampName, new_site: siteName,
		new_lat: lat, new_lon: lon, new_date: date,
		raw_date: get(row, 'Date'), raw_site: siteName
	});
});

// Write TSV
const lines = [OUT_COLS.join('\t')];
for (const row of outRows) {
	lines.push(OUT_COLS.map((c) => escTsv(row[c])).join('\t'));
}
// Prepend UTF-8 BOM so Excel-for-Mac auto-detects UTF-8. Importer strips BOM.
writeFileSync(outputPath, '﻿' + lines.join('\n') + '\n', 'utf-8');

// Write audit xlsx
const auditPath = outputPath.replace(/\.tsv$/i, '') + '.audit.xlsx';
const auditWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(auditWb, XLSX.utils.json_to_sheet(audit), 'audit');
writeFileSync(auditPath, XLSX.write(auditWb, { type: 'buffer', bookType: 'xlsx' }));

const withCoords = outRows.filter((r) => r.latitude && r.longitude).length;
console.error('=== clean-watershed-2025-2026 report ===');
console.error(`Input:   ${inputPath}`);
console.error(`Output:  ${outputPath}`);
console.error(`Audit:   ${auditPath}`);
console.error(`Rows in: ${dataRows.length}    Rows out: ${outRows.length}    Dropped: ${dropped}`);
console.error(`Coords:  with=${withCoords}  without=${outRows.length - withCoords}`);
