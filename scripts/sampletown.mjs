#!/usr/bin/env node
/**
 * Minimal SampleTown API client. No dependencies; Node 18+.
 *
 *   export SAMPLETOWN_TOKEN=st_...            # Account → API tokens
 *   export SAMPLETOWN_URL=https://edna.sampletown.org   # default
 *
 *   node scripts/sampletown.mjs template [--checklist MimarksS] [--extension Water] [--sheet mixs|sampletown] > t.tsv
 *   node scripts/sampletown.mjs import sheet.xlsx              # dry run: validates, writes nothing
 *   node scripts/sampletown.mjs import sheet.xlsx --commit     # actually imports
 *        [--project-id <id>] [--checklist MimarksS] [--extension Water]
 *        [--site-match-km 0.5] [--require-coords]
 *   node scripts/sampletown.mjs get /api/samples               # any GET, prints JSON
 */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

const BASE = (process.env.SAMPLETOWN_URL || 'https://edna.sampletown.org').replace(/\/$/, '');
const TOKEN = process.env.SAMPLETOWN_TOKEN;

function die(msg) {
	console.error(msg);
	process.exit(1);
}

function parseArgs(argv) {
	const pos = [];
	const opt = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a.startsWith('--')) {
			const key = a.slice(2);
			const next = argv[i + 1];
			if (next === undefined || next.startsWith('--')) opt[key] = true;
			else { opt[key] = next; i++; }
		} else pos.push(a);
	}
	return { pos, opt };
}

async function api(path, init = {}) {
	if (!TOKEN) die('Set SAMPLETOWN_TOKEN (create one under Account → API tokens).');
	const res = await fetch(BASE + path, {
		...init,
		headers: {
			Authorization: `Bearer ${TOKEN}`,
			// SvelteKit rejects form POSTs whose Origin doesn't match the site
			// (CSRF protection meant for browsers). A script has no origin of its
			// own, so it states the site's.
			Origin: BASE,
			...(init.headers || {})
		}
	});
	const text = await res.text();
	let body;
	try { body = JSON.parse(text); } catch { body = text; }
	if (!res.ok) die(`HTTP ${res.status}: ${typeof body === 'string' ? body : JSON.stringify(body, null, 2)}`);
	return body;
}

const { pos, opt } = parseArgs(process.argv.slice(2));
const cmd = pos[0];

if (cmd === 'template') {
	const q = new URLSearchParams({
		checklist: opt.checklist || 'MimarksS',
		...(opt.extension ? { extension: opt.extension } : { extension: 'Water' }),
		...(opt.sheet ? { sheet: opt.sheet } : {})
	});
	process.stdout.write(await api(`/api/mixs/template?${q}`));
} else if (cmd === 'import') {
	const file = pos[1];
	if (!file) die('usage: import <file.xlsx|file.tsv> [--commit]');
	const buf = await readFile(file);
	const form = new FormData();
	form.set('file', new Blob([buf]), basename(file));
	form.set('dryRun', opt.commit ? 'false' : 'true');
	form.set('allowSitesWithoutCoords', opt['require-coords'] ? 'false' : 'true');
	if (opt['project-id']) form.set('projectId', opt['project-id']);
	if (opt.checklist) form.set('defaultChecklist', opt.checklist);
	if (opt.extension) form.set('defaultExtension', opt.extension);
	if (opt['site-match-km']) form.set('siteMatchKm', String(opt['site-match-km']));
	const result = await api('/api/import/mixs', { method: 'POST', body: form });
	console.log(JSON.stringify(result, null, 2));
	if (!opt.commit) console.error('\n(dry run — nothing written. Re-run with --commit to import.)');
} else if (cmd === 'get') {
	const path = pos[1];
	if (!path?.startsWith('/api/')) die('usage: get /api/<path>');
	console.log(JSON.stringify(await api(path), null, 2));
} else {
	die('usage: sampletown.mjs template | import <file> [--commit] | get /api/<path>');
}
