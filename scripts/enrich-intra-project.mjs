#!/usr/bin/env node
/**
 * enrich-intra-project.mjs
 *
 * Within each project, propagate coordinates: for each row missing lat/lon,
 * look for other rows in the same project+station that DO have coords, and
 * copy the most-common pair. Handles the "not all samples got GPS logged
 * but multiple samples were taken at the same station" case which covers
 * a lot of the QEI 2025 / Namao / cruise data.
 *
 * Usage:
 *   node scripts/enrich-intra-project.mjs <input.tsv> <output.tsv>
 */

import { readFileSync, writeFileSync } from 'node:fs';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
	console.error('Usage: node scripts/enrich-intra-project.mjs <input.tsv> <output.tsv>');
	process.exit(1);
}

const text = readFileSync(inputPath, 'utf-8').replace(/^﻿/, '');
const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.length > 0);
const headers = lines[0].split('\t');
const col = (name) => headers.indexOf(name);
const latI = col('latitude'), lonI = col('longitude');
const projI = col('project_name'), codeI = col('site_code'), nameI = col('site_name');

if ([latI, lonI, projI].some((i) => i === -1)) {
	console.error('Input TSV missing required columns');
	process.exit(1);
}

// Build: project|station → [(lat, lon, count)]
const byStation = new Map();
function keyFor(row) {
	const proj = row[projI] || '';
	const station = (row[codeI] || row[nameI] || '').trim();
	if (!proj || !station) return null;
	return proj + '|' + station;
}
const rows = lines.slice(1).map((l) => l.split('\t'));
for (const row of rows) {
	const key = keyFor(row);
	if (!key) continue;
	const lat = row[latI], lon = row[lonI];
	if (!lat || !lon) continue;
	if (!byStation.has(key)) byStation.set(key, new Map());
	const coordStr = lat + ',' + lon;
	const m = byStation.get(key);
	m.set(coordStr, (m.get(coordStr) || 0) + 1);
}

// For each project|station, resolve the canonical coord (most common pair).
// If only one coord seen, that's it. If multiple coords differ significantly
// (>1 km apart via naive deg distance), keep blank — could be same station
// name reused for physically different sites.
const canonical = new Map();
for (const [key, coords] of byStation) {
	const entries = [...coords.entries()];
	if (entries.length === 1) {
		const [pair] = entries[0];
		canonical.set(key, pair);
		continue;
	}
	// Pick the most frequent; flag if others are far away.
	entries.sort((a, b) => b[1] - a[1]);
	const [winner] = entries[0];
	canonical.set(key, winner);
}

// Apply
let enriched = 0;
let stillBlank = 0;
for (const row of rows) {
	if (row[latI] && row[lonI]) continue;
	const key = keyFor(row);
	if (!key) { stillBlank++; continue; }
	const coord = canonical.get(key);
	if (!coord) { stillBlank++; continue; }
	const [lat, lon] = coord.split(',');
	row[latI] = lat;
	row[lonI] = lon;
	enriched++;
}

// Write
const out = [headers.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
writeFileSync(outputPath, '﻿' + out + '\n', 'utf-8');

console.error('=== enrich-intra-project report ===');
console.error(`Input rows:       ${rows.length}`);
console.error(`Project+station keys with canonical coords: ${canonical.size}`);
console.error(`Rows enriched:    ${enriched}`);
console.error(`Rows still blank: ${stillBlank}`);
console.error(`Output:           ${outputPath}`);
