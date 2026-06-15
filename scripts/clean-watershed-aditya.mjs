#!/usr/bin/env node
/**
 * clean-watershed-aditya.mjs
 *
 * Reads /tmp/watershed-aditya.xlsx (or whatever path you pass in), joining the
 * `watershed-aditya` sheet (MIxS-shaped sample + extract data) with the
 * `aditya_all` sheet (library prep + nanopore run metadata) on the
 * (storage_box, storage_location) ↔ (sample_box, box_slot) pair. Emits one TSV
 * with the full chain — sample → extract → library → run — that the import
 * endpoint at /api/import/mixs now creates in a single transaction.
 *
 * Usage:
 *   node scripts/clean-watershed-aditya.mjs <input.xlsx> <output.tsv>
 */

import * as XLSX from 'xlsx';
import { readFileSync, writeFileSync } from 'node:fs';

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
	console.error('Usage: node scripts/clean-watershed-aditya.mjs <input.xlsx> <output.tsv>');
	process.exit(1);
}

const wb = XLSX.read(readFileSync(inputPath), { type: 'buffer' });
const sampleRows = XLSX.utils.sheet_to_json(wb.Sheets['watershed-aditya'] || wb.Sheets[wb.SheetNames[0]], { raw: false, defval: '' });
const runRows = XLSX.utils.sheet_to_json(wb.Sheets['aditya_all'] || {}, { raw: false, defval: '' });

/** Build a lookup keyed by `${box.toLowerCase().trim()}|${slot.toLowerCase().trim()}` */
function joinKey(box, slot) {
	return String(box || '').toLowerCase().trim() + '|' + String(slot || '').toLowerCase().trim();
}

/** Pull a numeric "Gb" value from various spellings; returns undefined if not parseable. */
function gb(v) {
	const n = parseFloat(String(v || '').replace(/[^0-9.]/g, ''));
	return isNaN(n) ? undefined : n;
}

const RUN_LOOKUP = new Map();
for (const r of runRows) {
	const key = joinKey(r.sample_box, r.box_slot);
	if (!key.includes('|')) continue;
	RUN_LOOKUP.set(key, r);
}

const ADDED_COLS = [
	'library_name', 'library_barcode', 'library_prep_kit', 'library_prep_date',
	'library_platform', 'library_instrument_model', 'library_concentration_ng_ul',
	'library_notes',
	'run_name', 'run_date', 'run_platform', 'run_instrument_model',
	'run_flow_cell_id', 'run_directory', 'run_total_bases_gb',
	'run_fastq_dir', 'run_read_count'
];

// Output columns: existing watershed-aditya columns + added run/library columns
const sampleHeaders = sampleRows.length > 0 ? Object.keys(sampleRows[0]) : [];
const OUT_COLS = [...sampleHeaders, ...ADDED_COLS];

function escTsv(v) {
	const s = String(v ?? '');
	if (s.includes('\t') || s.includes('\n') || s.includes('"')) {
		return '"' + s.replace(/"/g, '""') + '"';
	}
	return s;
}

let joined = 0;
let unjoined = 0;
const out = [OUT_COLS.join('\t')];

for (const row of sampleRows) {
	const key = joinKey(row.storage_box, row.storage_location);
	const runMatch = RUN_LOOKUP.get(key);
	if (runMatch) joined++; else unjoined++;

	const enriched = { ...row };
	if (runMatch) {
		// Library fields
		enriched.library_name = runMatch.flowcell_barcode || '';
		enriched.library_barcode = runMatch.barcode || '';
		enriched.library_prep_kit = runMatch.kit_used || '';
		enriched.library_prep_date = runMatch.date_run ? formatDate(runMatch.date_run) : '';
		enriched.library_platform = 'OXFORD_NANOPORE';
		enriched.library_instrument_model = runMatch.run_hw || '';
		enriched.library_concentration_ng_ul = String(runMatch.library_concentration_ngul || '').trim();
		enriched.library_notes = '';

		// Run fields
		enriched.run_name = runMatch.run_id || runMatch.flowcell_barcode || '';
		enriched.run_date = runMatch.run_date ? formatDate(runMatch.run_date) : (runMatch.date_run ? formatDate(runMatch.date_run) : '');
		enriched.run_platform = 'OXFORD_NANOPORE';
		enriched.run_instrument_model = runMatch.run_hw || '';
		enriched.run_flow_cell_id = runMatch.flowcell || runMatch.flowcell_id || '';
		enriched.run_directory = runMatch.run_dir || '';
		const runGb = gb(runMatch.run_Gb);
		enriched.run_total_bases_gb = runGb != null ? String(runGb) : '';
		enriched.run_fastq_dir = runMatch.barcode_dir || '';
		// barcode_Mb is reads volume in megabases; multiply by 1M for read_count? not reliable;
		// leave for the user — write the raw Mb value as note instead via library_notes
		const mb = gb(runMatch.barcode_Mb);
		if (mb != null) enriched.library_notes = `barcode yield ${mb} Mb`;
	}

	out.push(OUT_COLS.map((c) => escTsv(enriched[c] ?? '')).join('\t'));
}

writeFileSync(outputPath, '﻿' + out.join('\n') + '\n', 'utf-8');

console.error('=== clean-watershed-aditya report ===');
console.error(`Input: ${inputPath}`);
console.error(`Output: ${outputPath}`);
console.error(`Sample rows: ${sampleRows.length}    Run rows: ${runRows.length}`);
console.error(`Joined (got run + library data): ${joined}`);
console.error(`Unjoined (sample-only): ${unjoined}`);

/** YYYYMMDD or YYYY-MM-DD passthrough; everything else returns as-is. */
function formatDate(raw) {
	const s = String(raw || '').trim();
	if (!s) return '';
	const m = /^(\d{4})[-/]?(\d{2})[-/]?(\d{2})$/.exec(s);
	if (m) return `${m[1]}-${m[2]}-${m[3]}`;
	return s;
}
