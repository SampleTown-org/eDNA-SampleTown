/**
 * Naming-template interpolation. Templates live in constrained_values with
 * `category='naming_template'` and values like `{Sample}_{Gene}_{Year}_{Number}`.
 *
 * Known tokens get substituted with whatever the caller knows (sample name,
 * gene, date, etc.). Unknown tokens are preserved verbatim so the user sees
 * the expected format and fills them in. A small set of "ambient" tokens
 * (date/year/month/day) auto-fill from the current clock when not provided
 * by the caller — so `{Year}` always works in any template even when the
 * page didn't explicitly pass one.
 */

/** Available tokens auto-injected by applyNameTemplate when not in `vars`. */
export const AMBIENT_TOKENS = ['Date', 'Year', 'Month', 'Day'] as const;

/** Common per-entity tokens forms typically pass into nameFromTemplate.
 *  Documented here so the settings page can show users what's available. */
export const ENTITY_TOKENS = [
	'Project', 'Site', 'Sample', 'Extract', 'Source', 'Parent',
	'Gene', 'Region', 'Type', 'Number', 'Instrument', 'PI', 'Location'
] as const;

function ambientVars(): Record<string, string> {
	const now = new Date();
	const y = String(now.getFullYear());
	const m = String(now.getMonth() + 1).padStart(2, '0');
	const d = String(now.getDate()).padStart(2, '0');
	return { date: `${y}-${m}-${d}`, year: y, month: m, day: d };
}

/**
 * Replace `{Token}` placeholders in `template` using case-insensitive lookup
 * in `vars` — falling back to ambient date tokens for {Date}/{Year}/{Month}/
 * {Day}. Tokens with no matching var are left as-is so users can spot what
 * still needs filling in.
 */
export function applyNameTemplate(
	template: string,
	vars: Record<string, string | number | null | undefined>
): string {
	const lc: Record<string, string> = { ...ambientVars() };
	for (const [k, v] of Object.entries(vars)) {
		if (v == null || v === '') continue;
		lc[k.toLowerCase()] = String(v);
	}
	return template.replace(/\{([^{}]+)\}/g, (_, raw) => {
		const key = raw.toLowerCase().trim();
		return key in lc ? lc[key] : `{${raw}}`;
	});
}

/**
 * Suggest a name by applying the named template with the given vars, or
 * fall back to the provided default when no template is configured.
 */
export function nameFromTemplate(
	templates: Record<string, string> | undefined,
	key: string,
	vars: Record<string, string | number | null | undefined>,
	fallback: string
): string {
	const tpl = templates?.[key];
	if (!tpl) return fallback;
	return applyNameTemplate(tpl, vars);
}
