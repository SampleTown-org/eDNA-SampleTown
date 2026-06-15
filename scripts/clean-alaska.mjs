#!/usr/bin/env node
/**
 * clean-alaska.mjs
 *
 * Cleans the `alaska` sheet from the legacy DNA master spreadsheet into a
 * MIxS TSV. The sheet is a minimal box/slot inventory — no per-row coords —
 * so all output rows land without lat/lon. The importer will skip them
 * until coords are added. Exists primarily to produce the audit trail and
 * a user-ready TSV for when station→coord data becomes available.
 *
 * Usage:
 *   node scripts/clean-alaska.mjs <input.xlsx> <output.tsv>
 */

import * as XLSX from 'xlsx';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
	console.error('Usage: node scripts/clean-alaska.mjs <input.xlsx> <output.tsv>');
	process.exit(1);
}

const wb = XLSX.read(readFileSync(inputPath), { type: 'buffer' });
const rows = XLSX.utils.sheet_to_json(wb.Sheets['alaska'], { raw: false, defval: '' });

function normalizeDate(raw) {
	const s = String(raw || '').trim();
	if (!s) return '';
	let m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
	if (m) return `${m[1]}-${m[2]}-${m[3]}`;
	m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/.exec(s);
	if (m) {
		const months = { jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
			jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12' };
		const mm = months[m[2].toLowerCase()];
		if (!mm) return '';
		const dd = m[1].padStart(2, '0');
		let yyyy = m[3].length === 2 ? ('20' + m[3]) : m[3];
		return `${yyyy}-${mm}-${dd}`;
	}
	if (/^\d{4}$/.test(s)) return s;
	return '';
}

function sanitizeName(raw) {
	return String(raw || '').trim().replace(/[^a-zA-Z0-9_.\-]/g, '.');
}

const OUT_COLS = [
	'samp_name', 'env_broad_scale', 'project_name', 'env_local_scale',
	'depth', 'env_medium', 'samp_taxon_id', 'geo_loc_name',
	'collection_date', 'seq_meth', 'lat_lon', 'target_gene',
	'site_code', 'site_name', 'latitude', 'longitude',
	'notes',
	'misc_param:legacy_row_id',
	'extract_name', 'extraction_date', 'concentration_ng_ul',
	'storage_box', 'storage_location', 'extract_notes'
];

const DEFAULTS = {
	env_broad_scale: 'marine biome [ENVO:00000447]',
	env_local_scale: 'not provided',
	geo_loc_name: 'USA: Alaska',
	samp_taxon_id: '1169740', // aquatic metagenome
	seq_meth: 'not provided',
	target_gene: '16S rRNA'
};

function escTsv(v) {
	const s = String(v ?? '');
	if (s.includes('\t') || s.includes('\n') || s.includes('"')) return '"' + s.replace(/"/g, '""') + '"';
	return s;
}

const outRows = [];
const audit = [];
const seenNames = new Map();

rows.forEach((r, i) => {
	const excelRow = i + 2;
	const slot = String(r.Slot || '').trim();
	const box = String(r.Box_ID || '').trim();
	const date = normalizeDate(r.Date);
	const station = String(r.Station || '').trim();
	const desc = String(r.__EMPTY || '').trim();
	const dnaConc = String(r.DNA_conc || '').trim();

	if (!slot && !box && !date && !station) {
		audit.push({ excel_row: excelRow, status: 'DROPPED', reason: 'all key fields blank' });
		return;
	}

	// samp_name: prefer description (which is often most specific), else
	// compose from station/slot/box. Ensure uniqueness by appending counter.
	let baseName = sanitizeName(desc || `${station}_${box}_${slot}`);
	if (!baseName) baseName = `alaska_row${excelRow}`;
	const count = (seenNames.get(baseName) || 0) + 1;
	seenNames.set(baseName, count);
	const sampName = count === 1 ? baseName : `${baseName}_${count}`;

	const legacy_id = createHash('sha1')
		.update(`alaska|${excelRow}|${slot}|${box}|${date}|${station}|${desc}`)
		.digest('hex').slice(0, 12);

	outRows.push({
		samp_name: sampName,
		env_broad_scale: DEFAULTS.env_broad_scale,
		project_name: 'Alaska',
		env_local_scale: DEFAULTS.env_local_scale,
		depth: 'not collected',
		env_medium: 'water',
		samp_taxon_id: DEFAULTS.samp_taxon_id,
		geo_loc_name: DEFAULTS.geo_loc_name,
		collection_date: date || 'not collected',
		seq_meth: DEFAULTS.seq_meth,
		lat_lon: '',
		target_gene: DEFAULTS.target_gene,
		site_code: '',   // Station values like "Healy 1901" are cruise descriptions, not codes
		site_name: station,
		latitude: '',
		longitude: '',
		notes: desc,
		'misc_param:legacy_row_id': legacy_id,
		extract_name: `${sampName}_ext`,
		extraction_date: '',
		concentration_ng_ul: dnaConc && !isNaN(parseFloat(dnaConc)) ? dnaConc : '',
		storage_box: box,
		storage_location: slot,
		extract_notes: ''
	});

	audit.push({
		excel_row: excelRow, status: 'CLEARED_NO_COORDS', legacy_id,
		new_samp_name: sampName, new_site: station, new_date: date,
		raw_Date: String(r.Date || ''), raw_Station: station, raw_DNA_conc: dnaConc
	});
});

const lines = [OUT_COLS.join('\t')];
for (const row of outRows) lines.push(OUT_COLS.map((c) => escTsv(row[c])).join('\t'));
writeFileSync(outputPath, '﻿' + lines.join('\n') + '\n', 'utf-8');

const auditPath = outputPath.replace(/\.tsv$/i, '') + '.audit.xlsx';
const auditWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(auditWb, XLSX.utils.json_to_sheet(audit), 'audit');
writeFileSync(auditPath, XLSX.write(auditWb, { type: 'buffer', bookType: 'xlsx' }));

console.error('=== clean-alaska report ===');
console.error(`Input:   ${inputPath}`);
console.error(`Output:  ${outputPath}`);
console.error(`Audit:   ${auditPath}`);
console.error(`Rows in: ${rows.length}    Rows out: ${outRows.length}`);
console.error('NB: Alaska sheet has no lat/lon — all rows will be skipped by the importer until coords are added.');
