#!/usr/bin/env node
/**
 * Builds the compact runtime index for a MIxS LinkML schema version.
 *
 * Reads:
 *   src/lib/mixs/schema/<version>/mixs.yaml           (LinkML source — rich metadata)
 *   src/lib/mixs/schema/<version>/mixs.schema.json    (generated JSON Schema — materialized classes)
 *
 * Writes:
 *   src/lib/mixs/generated/<version>/slots.json       { [slot]: { title, description, examples, pattern, range, slot_uri, ... } }
 *   src/lib/mixs/generated/<version>/classes.json     { [className]: { title, description, category, checklist?, extension?, required[], properties[] } }
 *   src/lib/mixs/generated/<version>/enums.json       { [enumName]: { description, values: [{ value, meaning?, description?, aliases? }] } }
 *
 * Invoke:   node scripts/mixs-build-index.mjs 6.3.0
 * (defaults to the VERSION file in the latest schema dir)
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');
const SCHEMA_ROOT = join(REPO, 'src/lib/mixs/schema');
const GEN_ROOT = join(REPO, 'src/lib/mixs/generated');

// --- Version resolution ---
const explicit = process.argv[2];
const version = explicit ?? pickLatestVersion();
const schemaDir = join(SCHEMA_ROOT, `v${version}`);
const outDir = join(GEN_ROOT, `v${version}`);
mkdirSync(outDir, { recursive: true });

console.log(`[mixs-build-index] version=${version}`);
console.log(`[mixs-build-index] reading  ${schemaDir}`);
console.log(`[mixs-build-index] writing  ${outDir}`);

// --- Load sources ---
const yamlDoc = parseYaml(readFileSync(join(schemaDir, 'mixs.yaml'), 'utf-8'));
const jschema = JSON.parse(readFileSync(join(schemaDir, 'mixs.schema.json'), 'utf-8'));

// --- Categorize classes dynamically from the LinkML `is_a` hierarchy ---
// In MIxS 6.3 the former "extension" concept is now formally an Extension
// (is_a: Extension). Checklists are is_a: Checklist. Combinations are named
// <Checklist><Extension>, e.g. MigsBaWater = MigsBa + Water extension.
const yClassesForCat = yamlDoc.classes ?? {};
const CHECKLIST_CLASSES = Object.entries(yClassesForCat)
	.filter(([, v]) => v?.is_a === 'Checklist')
	.map(([k]) => k);
const EXTENSION_CLASSES = Object.entries(yClassesForCat)
	.filter(([, v]) => v?.is_a === 'Extension')
	.map(([k]) => k);
const CHECKLIST_SET = new Set(CHECKLIST_CLASSES);
const EXTENSION_SET = new Set(EXTENSION_CLASSES);

// --- Build slots.json from YAML (for rich metadata) ---
const ySlots = yamlDoc.slots ?? {};
const slotsOut = {};
for (const [name, raw] of Object.entries(ySlots)) {
	// Skip meta "<x>_data" wrapper slots — they're LinkML plumbing, not user-facing fields
	if (name.endsWith('_data')) continue;
	const s = raw ?? {};
	slotsOut[name] = prune({
		name,
		title: s.title,
		description: flatten(s.description),
		comments: arrify(s.comments).map(flatten),
		examples: arrify(s.examples).map((e) => (typeof e === 'string' ? e : e?.value)).filter(Boolean),
		aliases: arrify(s.aliases),
		keywords: arrify(s.keywords),
		range: s.range,
		multivalued: s.multivalued || undefined,
		required: s.required || undefined,
		recommended: s.recommended || undefined,
		pattern: s.pattern,
		structured_pattern: s.structured_pattern?.syntax,
		slot_uri: s.slot_uri,
		see_also: arrify(s.see_also),
		in_subset: arrify(s.in_subset)
	});
}

// --- Build enums.json from YAML ---
const yEnums = yamlDoc.enums ?? {};
const enumsOut = {};
for (const [name, raw] of Object.entries(yEnums)) {
	const e = raw ?? {};
	const pv = e.permissible_values ?? {};
	enumsOut[name] = prune({
		name,
		title: e.title,
		description: flatten(e.description),
		comments: arrify(e.comments).map(flatten),
		values: Object.entries(pv).map(([val, meta]) => prune({
			value: val,
			meaning: meta?.meaning,
			description: flatten(meta?.description),
			aliases: arrify(meta?.aliases)
		}))
	});
}

// --- Build classes.json — combine YAML metadata with JSON Schema's materialized required arrays ---
const yClasses = yamlDoc.classes ?? {};
const jDefs = jschema.$defs ?? jschema.definitions ?? {};
const classesOut = {};
for (const [name, yc] of Object.entries(yClasses)) {
	const jc = jDefs[name] ?? null;
	const category = categorize(name, yc);
	const propNames = jc?.properties ? Object.keys(jc.properties) : [];
	const required = jc?.required ?? [];

	// slot_usage overrides per-class (recommended, examples, etc.)
	const slotUsage = {};
	for (const [slotName, usage] of Object.entries(yc?.slot_usage ?? {})) {
		slotUsage[slotName] = prune({
			required: usage?.required || undefined,
			recommended: usage?.recommended || undefined,
			examples: arrify(usage?.examples).map((e) => (typeof e === 'string' ? e : e?.value)).filter(Boolean)
		});
	}

	classesOut[name] = prune({
		name,
		title: yc?.title ?? name,
		description: flatten(yc?.description),
		category,
		checklist: category === 'combination' ? inferChecklist(name) : (category === 'checklist' ? name : undefined),
		extension: category === 'combination' ? inferExtension(name) : (category === 'extension' ? name : undefined),
		is_a: yc?.is_a,
		mixins: arrify(yc?.mixins),
		mixin: yc?.mixin || undefined,
		class_uri: yc?.class_uri,
		aliases: arrify(yc?.aliases),
		slots: arrify(yc?.slots),
		properties: propNames,
		required,
		slot_usage: Object.keys(slotUsage).length ? slotUsage : undefined
	});
}

// --- Write outputs ---
const header = { _version: version, _source: 'GSC MIxS LinkML', _generated_at: new Date().toISOString() };
writeFileSync(join(outDir, 'slots.json'), JSON.stringify({ ...header, slots: slotsOut }, null, 2));
writeFileSync(join(outDir, 'classes.json'), JSON.stringify({ ...header, classes: classesOut }, null, 2));
writeFileSync(join(outDir, 'enums.json'), JSON.stringify({ ...header, enums: enumsOut }, null, 2));

// Also write a tiny summary manifest so code can enumerate versions
const manifestPath = join(GEN_ROOT, 'manifest.json');
const manifest = readIfExists(manifestPath) ?? { versions: [], latest: null };
if (!manifest.versions.includes(version)) manifest.versions.push(version);
manifest.versions.sort(semverAsc);
manifest.latest = manifest.versions[manifest.versions.length - 1];
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`[mixs-build-index] wrote ${Object.keys(slotsOut).length} slots, ${Object.keys(classesOut).length} classes, ${Object.keys(enumsOut).length} enums`);

// --- helpers ---
function pickLatestVersion() {
	const dirs = readdirSync(SCHEMA_ROOT, { withFileTypes: true })
		.filter((d) => d.isDirectory() && d.name.startsWith('v'))
		.map((d) => d.name.slice(1))
		.sort(semverAsc);
	if (!dirs.length) throw new Error(`No schema versions under ${SCHEMA_ROOT}`);
	return dirs[dirs.length - 1];
}
function semverAsc(a, b) {
	const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
	for (let i = 0; i < 3; i++) { const d = (pa[i] ?? 0) - (pb[i] ?? 0); if (d) return d; }
	return 0;
}
function arrify(v) { return v == null ? [] : Array.isArray(v) ? v : [v]; }
function flatten(s) { if (s == null) return undefined; return String(s).replace(/\s+/g, ' ').trim(); }
function prune(o) {
	const out = {};
	for (const [k, v] of Object.entries(o)) {
		if (v == null) continue;
		if (Array.isArray(v) && v.length === 0) continue;
		if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
		out[k] = v;
	}
	return out;
}
function readIfExists(p) {
	try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return null; }
}
function categorize(name, yc) {
	if (CHECKLIST_SET.has(name)) return 'checklist';
	if (EXTENSION_SET.has(name)) return 'extension';
	// Combination classes are named <Checklist><Extension>, e.g. MigsBaWater
	for (const cl of CHECKLIST_CLASSES) {
		if (name.startsWith(cl) && name !== cl) {
			const rest = name.slice(cl.length);
			if (EXTENSION_SET.has(rest)) return 'combination';
		}
	}
	if (yc?.mixin) return 'mixin';
	return 'other';
}
function inferChecklist(combinationName) {
	for (const cl of CHECKLIST_CLASSES) {
		if (combinationName.startsWith(cl) && EXTENSION_SET.has(combinationName.slice(cl.length))) return cl;
	}
	return undefined;
}
function inferExtension(combinationName) {
	for (const cl of CHECKLIST_CLASSES) {
		if (combinationName.startsWith(cl)) {
			const rest = combinationName.slice(cl.length);
			if (EXTENSION_SET.has(rest)) return rest;
		}
	}
	return undefined;
}
