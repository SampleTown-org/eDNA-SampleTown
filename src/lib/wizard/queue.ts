/**
 * Wizard question queue — the data model behind the one-question-per-page
 * field-capture flow (docs/dev/offline-pwa.md, issue #4).
 *
 * Questions are derived from the active MIxS combination class via the same
 * `organizeForm()` the desktop batch grid uses, so the wizard inherits every
 * slot, widget type, picklist binding, and required/recommended marker for
 * free. Synthetic questions (project / site / samp_name / collection_date /
 * env_medium / people / photos) bracket the MIxS-derived ones because they map
 * to SampleTown-local concepts or special widgets the route renders itself.
 */
import { organizeForm, resolveSlotConfig, MISC_PARAM_PREFIX, type Picklists } from '$lib/mixs/sample-form';
import { getSlot, requiredSlotsFor, recommendedSlotsFor, allSlotsFor } from '$lib/mixs/schema-index';
import { slotTable } from '$lib/mixs/slot-ownership';

/** Widget kinds. The MIxS-derived ones mirror SlotConfig['type']; the rest are
 *  SampleTown-local widgets the route special-cases. */
export type WizardWidget =
	| 'text'
	| 'number'
	| 'date'
	| 'datetime'
	| 'select'
	| 'textarea'
	| 'project'
	| 'site'
	| 'env_medium'
	| 'people'
	| 'photos'
	| 'gps'
	| 'add_params';

export interface WizardQuestion {
	/** Field key — a MIxS slot name, a samples column, or a synthetic key
	 *  ('project_id', 'site_id', 'people', 'photos'). */
	key: string;
	label: string;
	section: string;
	required: boolean;
	recommended: boolean;
	widget: WizardWidget;
	options?: { value: string; label: string }[];
	placeholder?: string;
	/** MIxS slot name for the glossary doc icon, when one applies. */
	slot?: string;
	/** Carried across consecutive samples in a burst (site, date, people, …)
	 *  so the wizard only re-asks per-sample deltas. */
	carryForward: boolean;
}

/** Keys the route renders with bespoke widgets and excludes from the MIxS pass. */
export const SYNTHETIC_KEYS = new Set([
	'project_id',
	'site_id',
	'samp_name',
	'collection_date',
	'env_medium',
	'people',
	'photos'
]);

/** Aquatic field-context extras, suggested ONLY for the Water extension — they
 *  make no sense for soil / host-associated / etc. Weather are real MIxS slots;
 *  secchi has no slot so it's a misc_param. */
const AQUATIC_EXTRAS = [
	'air_temp',
	'wind_speed',
	'wind_direction',
	'barometric_press',
	'humidity',
	'water_current',
	'tidal_stage',
	`${MISC_PARAM_PREFIX}secchi_depth_m`
];

/** One template parameter: a MIxS slot or `misc_param:<tag>`, optionally
 *  pre-filled with a default the wizard seeds (still editable). Mirrors the
 *  server-side TemplateParam. */
export interface TemplateParam {
	key: string;
	value?: string;
}

/** Identity questions the wizard always asks first (also the keys never
 *  duplicated as template params). */
const IDENTITY_KEYS = new Set(['project_id', 'site_id', 'samp_name', 'collection_date', 'env_medium']);

/** Combo-appropriate quick-add suggestions for the "Add parameters" screen and
 *  the template builder: the MIxS-recommended slots for this combination (always
 *  apt), plus aquatic field-context extras only when the extension is Water.
 *  Excludes identity keys and anything already present. */
export function suggestedExtraKeys(checklist: string, extension: string | null, present: Set<string>): string[] {
	const ext = extension ?? '';
	const valid = new Set(allSlotsFor(checklist, ext));
	const out: string[] = [];
	for (const s of recommendedSlotsFor(checklist, ext)) {
		if (valid.has(s) && slotTable(s) === 'samples' && !IDENTITY_KEYS.has(s)) out.push(s);
	}
	if (ext === 'Water') {
		for (const k of AQUATIC_EXTRAS) {
			if (k.startsWith(MISC_PARAM_PREFIX) || valid.has(k)) out.push(k);
		}
	}
	return [...new Set(out)].filter((k) => !present.has(k));
}

function identityQuestions(picklists: Picklists): WizardQuestion[] {
	return [
		{ key: 'project_id', label: 'Project', section: 'Identity', required: true, recommended: false, widget: 'project', carryForward: true },
		{ key: 'site_id', label: 'Site', section: 'Identity', required: true, recommended: false, widget: 'site', carryForward: true },
		{ key: 'samp_name', label: 'Sample name', section: 'Identity', required: true, recommended: false, widget: 'text', placeholder: 'e.g. CHDR-W-01', slot: 'samp_name', carryForward: false },
		{ key: 'collection_date', label: 'Collection date & time', section: 'Identity', required: true, recommended: false, widget: 'datetime', slot: 'collection_date', carryForward: true },
		{ key: 'env_medium', label: 'Environmental medium', section: 'Identity', required: true, recommended: false, widget: 'env_medium', options: picklists['env_medium'], slot: 'env_medium', carryForward: false }
	];
}

/** Build a WizardQuestion for an arbitrary parameter key (MIxS slot or
 *  misc_param tag), resolving the widget exactly as the sample form does. */
export function questionForKey(
	key: string,
	picklists: Picklists,
	tier: { required: boolean; recommended: boolean }
): WizardQuestion {
	if (key.startsWith(MISC_PARAM_PREFIX)) {
		return {
			key,
			label: key.slice(MISC_PARAM_PREFIX.length).replace(/_/g, ' '),
			section: 'Custom',
			required: false,
			recommended: tier.recommended,
			widget: 'text',
			carryForward: false
		};
	}
	const cfg = resolveSlotConfig(key, picklists);
	const meta = getSlot(key);
	return {
		key,
		label: meta?.title ?? key,
		section: 'Parameters',
		required: tier.required,
		recommended: tier.recommended,
		widget: cfg.type,
		options: cfg.options,
		placeholder: cfg.placeholder,
		slot: key,
		carryForward: false
	};
}

/** The built-in default template for a MIxS combination: its required slots
 *  only (identity core is always asked separately). */
export function defaultTemplateParams(
	checklist: string,
	extension: string | null,
	picklists: Picklists = {}
): TemplateParam[] {
	return organizeForm(checklist, extension, picklists).required.map((c) => ({ key: c.slot }));
}

/** Sample slots valid for the combination that aren't already in `exclude` —
 *  drives the "Add parameters" dropdown. */
export function availableSlots(checklist: string, extension: string | null, exclude: Set<string>): string[] {
	return allSlotsFor(checklist, extension ?? '')
		.filter((s) => !exclude.has(s) && slotTable(s) === 'samples')
		.sort();
}

/**
 * Build the wizard queue for one sample from a template (or the built-in
 * required-only default when `templateParams` is omitted). Order: identity →
 * the template's parameters → "Add parameters" → photos. Required/recommended
 * tiers come from the MIxS combination, so the chips stay accurate regardless
 * of the template's own ordering.
 */
export function buildSampleQueue(
	checklist: string,
	extension: string | null,
	picklists: Picklists = {},
	templateParams?: TemplateParam[]
): WizardQuestion[] {
	const requiredSet = new Set(requiredSlotsFor(checklist, extension ?? ''));
	const recommendedSet = recommendedSlotsFor(checklist, extension ?? '');
	const params = templateParams ?? defaultTemplateParams(checklist, extension, picklists);

	const q: WizardQuestion[] = identityQuestions(picklists);
	const seen = new Set(q.map((x) => x.key));
	for (const p of params) {
		if (IDENTITY_KEYS.has(p.key) || seen.has(p.key)) continue;
		seen.add(p.key);
		q.push(questionForKey(p.key, picklists, { required: requiredSet.has(p.key), recommended: recommendedSet.has(p.key) }));
	}

	q.push({ key: '__add_params__', label: 'Add parameters', section: 'More', required: false, recommended: false, widget: 'add_params', carryForward: false });
	q.push({ key: 'photos', label: 'Photos', section: 'Photos', required: false, recommended: false, widget: 'photos', carryForward: false });
	return q;
}

/**
 * Build the question queue for the inline site sub-wizard (#5). GPS is a
 * dedicated widget (device geolocation + map pin); the rest map straight onto
 * `sites` columns. `site_name` is the only required field (matches the table's
 * sole NOT NULL beyond the lab/project keys).
 */
export function buildSiteQueue(picklists: Picklists = {}): WizardQuestion[] {
	const sel = (key: string): WizardWidget => (picklists[key]?.length ? 'select' : 'text');
	return [
		{ key: 'site_name', label: 'Site name', section: 'Site', required: true, recommended: false, widget: 'text', placeholder: 'e.g. Chukchi Drift Station', carryForward: false },
		{ key: 'gps', label: 'Location (GPS)', section: 'Site', required: false, recommended: true, widget: 'gps', carryForward: false },
		{ key: 'geo_loc_name', label: 'Geographic location', section: 'Site', required: false, recommended: true, widget: sel('geo_loc_name'), options: picklists['geo_loc_name'], slot: 'geo_loc_name', placeholder: 'country:region', carryForward: false },
		{ key: 'locality', label: 'Locality', section: 'Site', required: false, recommended: false, widget: 'text', placeholder: 'finer-grained place name', carryForward: false },
		{ key: 'env_broad_scale', label: 'Broad-scale environment', section: 'Site', required: false, recommended: true, widget: sel('env_broad_scale'), options: picklists['env_broad_scale'], slot: 'env_broad_scale', placeholder: 'ENVO biome term', carryForward: false },
		{ key: 'env_local_scale', label: 'Local environmental feature', section: 'Site', required: false, recommended: false, widget: sel('env_local_scale'), options: picklists['env_local_scale'], slot: 'env_local_scale', placeholder: 'ENVO feature term', carryForward: false },
		{ key: 'description', label: 'Description / access notes', section: 'Site', required: false, recommended: false, widget: 'textarea', carryForward: false }
	];
}

/** A value counts as "answered" when it's a non-empty trimmed string. People /
 *  photos arrays count when non-empty. */
export function isAnswered(q: WizardQuestion, value: unknown): boolean {
	if (q.widget === 'people' || q.widget === 'photos') {
		return Array.isArray(value) && value.length > 0;
	}
	return typeof value === 'string' ? value.trim() !== '' : value != null;
}

/**
 * Validate an answer for the Skip↔Next flip. Empty is "not yet valid" (button
 * stays on Skip). Non-empty must pass the widget's type check. Required-ness is
 * enforced separately at Complete time, not here.
 */
export function isValid(q: WizardQuestion, value: unknown): boolean {
	// The "Add parameters" step has nothing to answer — always proceedable.
	if (q.widget === 'add_params') return true;
	if (!isAnswered(q, value)) return false;
	if (q.widget === 'number') {
		return !Number.isNaN(Number(String(value).trim()));
	}
	if (q.widget === 'date') {
		return /^\d{4}-\d{2}-\d{2}/.test(String(value).trim());
	}
	if (q.widget === 'datetime') {
		return /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/.test(String(value).trim());
	}
	if (q.widget === 'select' || q.widget === 'env_medium') {
		if (!q.options || q.options.length === 0) return true;
		return q.options.some((o) => o.value === String(value));
	}
	return true;
}
