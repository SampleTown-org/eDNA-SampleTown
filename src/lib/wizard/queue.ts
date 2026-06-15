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
import { organizeForm, MISC_PARAM_PREFIX, type Picklists, type SlotConfig } from '$lib/mixs/sample-form';
import { getSlot, getEnum } from '$lib/mixs/schema-index';

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
	| 'gps';

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

/** Tier-2 field-condition slots (#7), all real MIxS v6.3.0 slots → stored in
 *  the sample_values EAV, no migration. Order = capture order in the wizard. */
const WEATHER_SLOTS = [
	'air_temp',
	'wind_speed',
	'wind_direction',
	'barometric_press',
	'humidity',
	'water_current',
	'tidal_stage'
];

/** Resolve a weather slot's widget from its MIxS range: enum → select,
 *  numeric → number, else text. (organizeForm's resolver is private, and
 *  these slots may not be class properties, so we resolve them directly.) */
function weatherWidget(slot: string): { widget: WizardWidget; options?: { value: string; label: string }[] } {
	const meta = getSlot(slot);
	if (meta?.range) {
		const enumDef = getEnum(meta.range);
		if (enumDef && enumDef.values.length > 0) {
			return { widget: 'select', options: enumDef.values.map((v) => ({ value: v.value, label: v.value })) };
		}
		if (/^(float|double|integer|decimal)$/i.test(meta.range)) return { widget: 'number' };
	}
	return { widget: 'text' };
}

function fromSlotConfig(cfg: SlotConfig, required: boolean, section: string): WizardQuestion {
	const meta = getSlot(cfg.slot);
	return {
		key: cfg.slot,
		label: meta?.title ?? cfg.slot,
		section,
		required,
		recommended: cfg.recommended ?? false,
		widget: cfg.type,
		options: cfg.options,
		placeholder: cfg.placeholder,
		slot: cfg.slot,
		carryForward: false
	};
}

/**
 * Build the full ordered question queue for one sample.
 *
 * Order: identity (project → site → samp_name → collection_date → env_medium)
 * → MIxS-required → people → MIxS-recommended/optional (Sampling & Storage,
 * then Other) → photos. `picklists` binds local vocabularies onto matching
 * slots exactly as the batch grid does.
 */
export function buildSampleQueue(
	checklist: string,
	extension: string | null,
	picklists: Picklists = {}
): WizardQuestion[] {
	const org = organizeForm(checklist, extension, picklists);
	const q: WizardQuestion[] = [];

	// Identity — synthetic widgets, all carry-forward except the per-sample name.
	q.push({ key: 'project_id', label: 'Project', section: 'Identity', required: true, recommended: false, widget: 'project', carryForward: true });
	q.push({ key: 'site_id', label: 'Site', section: 'Identity', required: true, recommended: false, widget: 'site', carryForward: true });
	q.push({ key: 'samp_name', label: 'Sample name', section: 'Identity', required: true, recommended: false, widget: 'text', placeholder: 'e.g. CHDR-W-01', slot: 'samp_name', carryForward: false });
	q.push({ key: 'collection_date', label: 'Collection date & time', section: 'Identity', required: true, recommended: false, widget: 'datetime', slot: 'collection_date', carryForward: true });
	q.push({
		key: 'env_medium',
		label: 'Environmental medium',
		section: 'Identity',
		required: true,
		recommended: false,
		widget: 'env_medium',
		options: picklists['env_medium'],
		slot: 'env_medium',
		carryForward: false
	});

	// MIxS-required slots that live on the samples table (organizeForm already
	// filtered out header + off-table slots).
	for (const cfg of org.required) q.push(fromSlotConfig(cfg, true, 'Required'));

	// Everything after the Required block is split into two tiers and appended
	// in order, so the wizard always runs Required → Suggested → Optional and
	// the tier chips (red Required, amber Suggested, slate Optional) match the
	// run order. `q` so far holds only Required (identity core + MIxS-required).
	const suggested: WizardQuestion[] = [];
	const optional: WizardQuestion[] = [];
	const seen = new Set(q.map((x) => x.key));

	// Weather/conditions are MIxS-recommended field context → Suggested.
	for (const slot of WEATHER_SLOTS) {
		if (seen.has(slot)) continue;
		const meta = getSlot(slot);
		if (!meta) continue;
		const { widget, options } = weatherWidget(slot);
		suggested.push({ key: slot, label: meta.title ?? slot, section: 'Conditions', required: false, recommended: true, widget, options, placeholder: meta.examples?.[0], slot, carryForward: true });
		seen.add(slot);
	}
	// Secchi clarity has no MIxS slot — capture as a misc_param. Suggested.
	suggested.push({ key: `${MISC_PARAM_PREFIX}secchi_depth_m`, label: 'Secchi depth (m)', section: 'Conditions', required: false, recommended: true, widget: 'number', placeholder: 'water clarity', carryForward: true });

	// Remaining class slots: Suggested if MIxS-recommended, else Optional.
	const buckets = Object.entries(org.optional).sort(([a], [b]) =>
		a === 'Sampling & Storage' ? -1 : b === 'Sampling & Storage' ? 1 : a.localeCompare(b)
	);
	for (const [bucket, list] of buckets) {
		for (const cfg of list) {
			if (seen.has(cfg.slot)) continue;
			seen.add(cfg.slot);
			(cfg.recommended ? suggested : optional).push(fromSlotConfig(cfg, false, bucket));
		}
	}

	// SampleTown extras (people, photos) are Optional, at the very end.
	optional.push({ key: 'people', label: 'People', section: 'People', required: false, recommended: false, widget: 'people', carryForward: true });
	optional.push({ key: 'photos', label: 'Photos', section: 'Photos', required: false, recommended: false, widget: 'photos', carryForward: false });

	return [...q, ...suggested, ...optional];
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
