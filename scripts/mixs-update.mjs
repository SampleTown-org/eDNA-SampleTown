#!/usr/bin/env node
/**
 * Pull a new MIxS release from GitHub, check it in alongside the current
 * version, regenerate the runtime indices, and emit a diff report against
 * the previously-active version so human review catches breaking changes
 * before the bump is merged.
 *
 * Invoke:   node scripts/mixs-update.mjs 6.4.0
 *
 * Writes:
 *   src/lib/mixs/schema/v<new>/mixs.yaml + mixs.schema.json + VERSION
 *   src/lib/mixs/generated/v<new>/{slots,classes,enums}.json
 *   .mixs-upgrade-<new>.md  (diff report)
 *
 * The diff report categorizes changes: added / removed / renamed slots
 * (detected via stable slot_uri), required-set changes per combination
 * class, and enum value changes. It does NOT flip MIXS_ACTIVE_VERSION —
 * that's a manual edit after reviewing the report.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const SCHEMA_ROOT = join(REPO, 'src/lib/mixs/schema');
const GEN_ROOT = join(REPO, 'src/lib/mixs/generated');

const target = process.argv[2];
if (!target) {
	console.error('Usage: node scripts/mixs-update.mjs <version>   (e.g. 6.4.0)');
	process.exit(1);
}

const targetDir = join(SCHEMA_ROOT, `v${target}`);
if (existsSync(targetDir)) {
	console.error(`[mixs-update] v${target} already checked in; aborting so nothing gets clobbered`);
	process.exit(1);
}
mkdirSync(targetDir, { recursive: true });

const tag = `v${target}`;
const urls = {
	yaml: `https://raw.githubusercontent.com/GenomicsStandardsConsortium/mixs/${tag}/src/mixs/schema/mixs.yaml`,
	jschema: `https://raw.githubusercontent.com/GenomicsStandardsConsortium/mixs/${tag}/project/jsonschema/mixs.schema.json`
};

console.log(`[mixs-update] fetching tag ${tag}...`);
for (const [name, url] of Object.entries(urls)) {
	const outFile = name === 'yaml' ? 'mixs.yaml' : 'mixs.schema.json';
	const outPath = join(targetDir, outFile);
	execSync(`curl -fsSL -o "${outPath}" "${url}"`, { stdio: 'inherit' });
}
writeFileSync(join(targetDir, 'VERSION'), target + '\n');

console.log(`[mixs-update] building runtime index for v${target}...`);
execSync(`node "${join(__dirname, 'mixs-build-index.mjs')}" ${target}`, { stdio: 'inherit', cwd: REPO });

// --- Diff against the current active version ------------------------------
const currentActive = findCurrentActiveVersion();
if (!currentActive || currentActive === target) {
	console.log('[mixs-update] no prior version to diff against; skipping report');
	process.exit(0);
}

console.log(`[mixs-update] diffing v${currentActive} → v${target}...`);
const oldSlots = loadGen(currentActive, 'slots').slots;
const newSlots = loadGen(target, 'slots').slots;
const oldClasses = loadGen(currentActive, 'classes').classes;
const newClasses = loadGen(target, 'classes').classes;
const oldEnums = loadGen(currentActive, 'enums').enums;
const newEnums = loadGen(target, 'enums').enums;

// Slot identity by slot_uri (stable across renames)
const oldByUri = indexByUri(oldSlots);
const newByUri = indexByUri(newSlots);

const renamed = [];
const removedSlots = [];
const addedSlots = [];

for (const [uri, oldName] of oldByUri) {
	const newName = newByUri.get(uri);
	if (!newName) removedSlots.push(oldName);
	else if (newName !== oldName) renamed.push({ old: oldName, new: newName, uri });
}
for (const [uri, newName] of newByUri) {
	if (!oldByUri.has(uri)) addedSlots.push(newName);
}

// Combination-class required-set changes
const classDiffs = [];
for (const name of Object.keys(oldClasses)) {
	const oldReq = new Set(oldClasses[name]?.required ?? []);
	const newReq = new Set(newClasses[name]?.required ?? []);
	if (!newClasses[name]) {
		classDiffs.push({ name, type: 'removed' });
		continue;
	}
	const added = [...newReq].filter((r) => !oldReq.has(r));
	const removed = [...oldReq].filter((r) => !newReq.has(r));
	if (added.length || removed.length) {
		classDiffs.push({ name, type: 'required_changed', added, removed });
	}
}
for (const name of Object.keys(newClasses)) {
	if (!oldClasses[name]) classDiffs.push({ name, type: 'added' });
}

// Enum changes
const enumDiffs = [];
for (const name of Object.keys(oldEnums)) {
	const oldVals = new Set((oldEnums[name]?.values ?? []).map((v) => v.value));
	const newVals = new Set((newEnums[name]?.values ?? []).map((v) => v.value));
	const added = [...newVals].filter((v) => !oldVals.has(v));
	const removed = [...oldVals].filter((v) => !newVals.has(v));
	if (added.length || removed.length) enumDiffs.push({ name, added, removed });
}

const report = buildReport({
	from: currentActive,
	to: target,
	renamed,
	addedSlots,
	removedSlots,
	classDiffs,
	enumDiffs
});
const reportPath = join(REPO, `.mixs-upgrade-${target}.md`);
writeFileSync(reportPath, report);
console.log(`\n[mixs-update] diff report: ${reportPath}`);
console.log(`[mixs-update] ${renamed.length} renamed, ${addedSlots.length} added, ${removedSlots.length} removed slots; ${classDiffs.length} class changes; ${enumDiffs.length} enum changes`);
console.log(`\nNext steps:`);
console.log(`  1. Review ${reportPath}`);
console.log(`  2. Write a migration SQL for any removed/renamed slots used as columns`);
console.log(`  3. Bump MIXS_ACTIVE_VERSION in src/lib/mixs/schema-index.ts to '${target}'`);
console.log(`  4. Update the JSON import paths in schema-index.ts to v${target}`);

// --- helpers --------------------------------------------------------------
function findCurrentActiveVersion() {
	// Read it out of schema-index.ts so we diff against whatever the app uses,
	// not just whatever's newest on disk (those can differ during a staged bump).
	try {
		const src = readFileSync(join(REPO, 'src/lib/mixs/schema-index.ts'), 'utf-8');
		const m = src.match(/MIXS_ACTIVE_VERSION\s*=\s*['"]([^'"]+)['"]/);
		return m ? m[1] : null;
	} catch {
		return null;
	}
}

function loadGen(version, kind) {
	return JSON.parse(readFileSync(join(GEN_ROOT, `v${version}`, `${kind}.json`), 'utf-8'));
}

function indexByUri(slotMap) {
	const m = new Map();
	for (const [name, slot] of Object.entries(slotMap)) {
		if (slot?.slot_uri) m.set(slot.slot_uri, name);
	}
	return m;
}

function buildReport({ from, to, renamed, addedSlots, removedSlots, classDiffs, enumDiffs }) {
	const lines = [];
	lines.push(`# MIxS upgrade: v${from} → v${to}`);
	lines.push('');
	lines.push(`_Generated ${new Date().toISOString()}_`);
	lines.push('');

	lines.push('## Summary');
	lines.push(`- **${renamed.length}** renamed slots (stable slot_uri)`);
	lines.push(`- **${addedSlots.length}** new slots`);
	lines.push(`- **${removedSlots.length}** removed slots`);
	lines.push(`- **${classDiffs.length}** class changes`);
	lines.push(`- **${enumDiffs.length}** enum value changes`);
	lines.push('');

	if (renamed.length) {
		lines.push('## Renamed slots');
		lines.push('These keep their meaning but change name. If SampleTown uses the old name as a DB column or API field, write a migration.');
		lines.push('');
		for (const r of renamed) lines.push(`- \`${r.old}\` → \`${r.new}\`  (${r.uri})`);
		lines.push('');
	}

	if (removedSlots.length) {
		lines.push('## Removed slots');
		lines.push('⚠ Breaking if SampleTown stored values in any of these.');
		lines.push('');
		for (const s of removedSlots) lines.push(`- \`${s}\``);
		lines.push('');
	}

	if (addedSlots.length) {
		lines.push('## New slots');
		lines.push('');
		for (const s of addedSlots) lines.push(`- \`${s}\``);
		lines.push('');
	}

	const changedReq = classDiffs.filter((d) => d.type === 'required_changed');
	if (changedReq.length) {
		lines.push('## Required-set changes (existing classes)');
		lines.push('');
		for (const c of changedReq) {
			lines.push(`### ${c.name}`);
			if (c.added.length) lines.push(`- **+required:** ${c.added.map((x) => '`' + x + '`').join(', ')}`);
			if (c.removed.length) lines.push(`- **-required:** ${c.removed.map((x) => '`' + x + '`').join(', ')}`);
			lines.push('');
		}
	}

	const addedCls = classDiffs.filter((d) => d.type === 'added');
	const removedCls = classDiffs.filter((d) => d.type === 'removed');
	if (addedCls.length || removedCls.length) {
		lines.push('## Classes');
		if (addedCls.length) lines.push(`- **Added:** ${addedCls.map((c) => '`' + c.name + '`').join(', ')}`);
		if (removedCls.length) lines.push(`- **Removed:** ${removedCls.map((c) => '`' + c.name + '`').join(', ')}`);
		lines.push('');
	}

	if (enumDiffs.length) {
		lines.push('## Enum changes');
		lines.push('');
		for (const e of enumDiffs) {
			lines.push(`### ${e.name}`);
			if (e.added.length) lines.push(`- **+values:** ${e.added.map((x) => '`' + x + '`').join(', ')}`);
			if (e.removed.length) lines.push(`- **-values:** ${e.removed.map((x) => '`' + x + '`').join(', ')}`);
			lines.push('');
		}
	}

	return lines.join('\n') + '\n';
}
