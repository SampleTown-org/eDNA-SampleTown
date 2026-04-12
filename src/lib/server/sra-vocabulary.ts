import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import * as XLSX from 'xlsx';
import fallback from '$lib/sra/sra-vocabulary-fallback.json';

const DB_PATH = process.env.DB_PATH || 'data/sampletown.db';
const CACHE_DIR = dirname(DB_PATH);
const CACHE_PATH = join(CACHE_DIR, 'sra-metadata.xlsx');
const SRA_URL = 'https://ftp-trace.ncbi.nlm.nih.gov/sra/metadata_table/SRA_metadata.xlsx';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SraVocabEntry {
	value: string;
	description: string;
}

export interface SraVocabulary {
	strategies: SraVocabEntry[];
	sources: SraVocabEntry[];
	selections: SraVocabEntry[];
	platforms: Record<string, string[]>;
	fetchedAt: string | null;
}

let _cached: SraVocabulary | null = null;

/** Download the SRA metadata xlsx if stale or missing. Returns the file path. */
export async function ensureSraXlsx(): Promise<string> {
	mkdirSync(CACHE_DIR, { recursive: true });

	if (existsSync(CACHE_PATH)) {
		const age = Date.now() - statSync(CACHE_PATH).mtimeMs;
		if (age < MAX_AGE_MS) return CACHE_PATH;
	}

	try {
		const res = await fetch(SRA_URL);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const buf = Buffer.from(await res.arrayBuffer());
		writeFileSync(CACHE_PATH, buf);
		_cached = null; // invalidate parsed cache
		console.log('[sra] Downloaded SRA_metadata.xlsx from NCBI');
	} catch (err) {
		console.warn('[sra] Failed to download SRA_metadata.xlsx, using cached/fallback:', err);
	}

	return CACHE_PATH;
}

/** Parse the cached xlsx into structured vocabulary. Falls back to bundled JSON. */
export function parseSraVocabulary(xlsxPath?: string): SraVocabulary {
	if (_cached) return _cached;

	const path = xlsxPath ?? CACHE_PATH;

	try {
		if (!existsSync(path)) throw new Error('No cached file');
		const buf = readFileSync(path);
		const wb = XLSX.read(buf, { type: 'buffer' });
		const ws = wb.Sheets['Library and Platform Terms'];
		if (!ws) throw new Error('Missing sheet');

		const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
		const vocab: SraVocabulary = {
			strategies: [],
			sources: [],
			selections: [],
			platforms: {},
			fetchedAt: existsSync(path) ? statSync(path).mtime.toISOString() : null
		};

		let section = '';
		let platformStartIdx = -1;

		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			if (!row || row.length === 0) continue;

			const first = String(row[0] ?? '').trim();
			if (first === 'Strategy') { section = 'strategy'; continue; }
			if (first === 'Source') { section = 'source'; continue; }
			if (first === 'Selection') { section = 'selection'; continue; }
			if (first === 'Platforms') { section = 'platforms'; platformStartIdx = i; continue; }

			if (section === 'strategy' && first) {
				vocab.strategies.push({ value: first, description: String(row[1] ?? '').trim() });
			} else if (section === 'source' && first) {
				vocab.sources.push({ value: first, description: String(row[1] ?? '').trim() });
			} else if (section === 'selection' && first) {
				vocab.selections.push({ value: first, description: String(row[1] ?? '').trim() });
			}
		}

		// Platforms are columnar: header row has platform names, rows below have instruments
		if (platformStartIdx >= 0) {
			const hdrRow = rows[platformStartIdx + 1];
			if (hdrRow) {
				for (let col = 1; col < hdrRow.length; col++) {
					const plat = String(hdrRow[col] ?? '').trim().replace(/^_/, '');
					if (!plat) continue;
					const instruments: string[] = [];
					for (let r = platformStartIdx + 2; r < rows.length; r++) {
						const val = rows[r]?.[col] ? String(rows[r][col]).trim() : '';
						if (val) instruments.push(val);
					}
					if (instruments.length > 0) vocab.platforms[plat] = instruments;
				}
			}
		}

		_cached = vocab;
		return vocab;
	} catch {
		// Fallback to bundled JSON
		_cached = { ...(fallback as SraVocabulary), fetchedAt: null };
		return _cached;
	}
}

/** Get the vocabulary, downloading if needed. */
export async function getSraVocabulary(): Promise<SraVocabulary> {
	const path = await ensureSraXlsx();
	return parseSraVocabulary(path);
}

/** Synchronous version — uses cached xlsx or fallback. No download. */
export function getSraVocabularySync(): SraVocabulary {
	return parseSraVocabulary();
}

/** Build flat Sets for quick membership testing. */
export function buildSraValueSets(vocab: SraVocabulary) {
	return {
		strategies: new Set(vocab.strategies.map(s => s.value)),
		sources: new Set(vocab.sources.map(s => s.value)),
		selections: new Set(vocab.selections.map(s => s.value)),
		platforms: new Set(Object.keys(vocab.platforms)),
		instruments: new Set(Object.values(vocab.platforms).flat())
	};
}
