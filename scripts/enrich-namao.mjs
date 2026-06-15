#!/usr/bin/env node
/**
 * enrich-namao.mjs
 *
 * Takes a cleaned mastersheet TSV (from clean-mastersheet.mjs), filters to
 * Namao* projects, and backfills lat/lon using the analysis_NAMAO metadata
 * master (meta.namao.all.csv). Join key: (year, station) with date fallback.
 *
 * Usage:
 *   node scripts/enrich-namao.mjs <input.tsv> <output.tsv> [meta.namao.all.csv]
 */

import { readFileSync, writeFileSync } from 'node:fs';

const [, , inputPath, outputPath, metaPathRaw] = process.argv;
const metaPath = metaPathRaw || '/matika/microscape/out_dada_20241008/analysis_NAMAO/meta.namao.all.csv';

if (!inputPath || !outputPath) {
	console.error('Usage: node scripts/enrich-namao.mjs <input.tsv> <output.tsv> [meta.namao.all.csv]');
	process.exit(1);
}

/** Parse a simple CSV (quoted fields with embedded commas). */
function parseCsvLine(line) {
	const out = [];
	let i = 0;
	while (i <= line.length) {
		if (i >= line.length) { out.push(''); break; }
		if (line[i] === '"') {
			let val = '';
			i++;
			while (i < line.length) {
				if (line[i] === '"' && line[i+1] === '"') { val += '"'; i += 2; }
				else if (line[i] === '"') { i++; break; }
				else { val += line[i]; i++; }
			}
			if (i < line.length && line[i] === ',') i++;
			out.push(val);
		} else {
			const c = line.indexOf(',', i);
			if (c === -1) { out.push(line.slice(i)); break; }
			out.push(line.slice(i, c));
			i = c + 1;
		}
	}
	return out;
}

function parseCsv(text) {
	const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.length > 0);
	if (lines.length === 0) return { headers: [], rows: [] };
	const headers = parseCsvLine(lines[0]);
	const rows = lines.slice(1).map((l) => {
		const cells = parseCsvLine(l);
		const r = {};
		for (let i = 0; i < headers.length; i++) r[headers[i]] = cells[i] ?? '';
		return r;
	});
	return { headers, rows };
}

/** Normalize a station code for fuzzy joining (upper, strip whitespace,
 *  collapse multiple spaces). Metadata has "26S", "W4"; mastersheet has
 *  matching values so this is mostly a safety net. */
function normStation(s) {
	return String(s || '').trim().toUpperCase().replace(/\s+/g, '');
}

// Load metadata
const metaText = readFileSync(metaPath, 'utf-8');
const { rows: metaRows } = parseCsv(metaText);

// Build lookup: key = `${year}|${station}` → { lat, lon, date }
// Store ALL matches; ambiguity resolved later by date when we have it.
const META_LOOKUP = new Map();
let metaWithCoords = 0;
for (const r of metaRows) {
	const year = String(r['year.x.x'] || '').trim().replace(/[^0-9]/g, '');
	const station = normStation(r['station.x.x']);
	const lat = parseFloat(r['latitude.x.x']);
	const lon = parseFloat(r['longitude.x.x']);
	if (!year || !station || isNaN(lat) || isNaN(lon)) continue;
	metaWithCoords++;
	const key = `${year}|${station}`;
	if (!META_LOOKUP.has(key)) META_LOOKUP.set(key, []);
	META_LOOKUP.get(key).push({ lat, lon, date: r['date.x'], project: r['project'] });
}
console.error(`Metadata loaded: ${metaRows.length} rows, ${metaWithCoords} with usable (year, station, lat, lon) tuples, ${META_LOOKUP.size} unique year|station keys`);

// Load input TSV
const tsvText = readFileSync(inputPath, 'utf-8').replace(/^﻿/, '');
const tsvLines = tsvText.replace(/\r\n/g, '\n').split('\n').filter((l) => l.length > 0);
const headers = tsvLines[0].split('\t');
const latIdx = headers.indexOf('latitude');
const lonIdx = headers.indexOf('longitude');
const projIdx = headers.indexOf('project_name');
const siteCodeIdx = headers.indexOf('site_code');
const siteNameIdx = headers.indexOf('site_name');
const dateIdx = headers.indexOf('collection_date');

if ([latIdx, lonIdx, projIdx, siteCodeIdx, dateIdx].some((i) => i === -1)) {
	console.error('Input TSV is missing required columns');
	process.exit(1);
}

let enriched = 0;
let namaoRows = 0;
let stillNoCoords = 0;
const outLines = [headers.join('\t')];
for (let i = 1; i < tsvLines.length; i++) {
	const cells = tsvLines[i].split('\t');
	const project = cells[projIdx] || '';
	if (!/^Namao/.test(project)) {
		outLines.push(tsvLines[i]);
		continue;
	}
	namaoRows++;

	// Skip if already has coords
	if (cells[latIdx] && cells[lonIdx]) {
		outLines.push(tsvLines[i]);
		continue;
	}

	// Derive year from project name (Namao 2022 → 2022) or from collection_date
	const date = cells[dateIdx] || '';
	const yearMatch = project.match(/\b(\d{4})\b/) || date.match(/^(\d{4})/);
	const year = yearMatch ? yearMatch[1] : '';
	const station = normStation(cells[siteCodeIdx] || cells[siteNameIdx]);
	if (!year || !station) { stillNoCoords++; outLines.push(tsvLines[i]); continue; }

	const matches = META_LOOKUP.get(`${year}|${station}`);
	if (!matches || matches.length === 0) { stillNoCoords++; outLines.push(tsvLines[i]); continue; }

	// If multiple matches, prefer the one closest to the row's date. The
	// metadata `date.x` is human-readable like "September 23, 2022"; best we
	// can do is match on month prefix. Falls back to first match.
	let best = matches[0];
	if (matches.length > 1 && date) {
		const month = parseInt(date.split('-')[1], 10);
		const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
		if (month) {
			const monthStr = monthNames[month - 1];
			const monthHit = matches.find((m) => String(m.date || '').toLowerCase().includes(monthStr));
			if (monthHit) best = monthHit;
		}
	}

	cells[latIdx] = String(best.lat);
	cells[lonIdx] = String(best.lon);
	outLines.push(cells.join('\t'));
	enriched++;
}

writeFileSync(outputPath, '﻿' + outLines.join('\n') + '\n', 'utf-8');

console.error('=== enrich-namao report ===');
console.error(`Namao rows scanned: ${namaoRows}`);
console.error(`Coords enriched:   ${enriched}`);
console.error(`Still no coords:   ${stillNoCoords}`);
console.error(`Output:            ${outputPath}`);
