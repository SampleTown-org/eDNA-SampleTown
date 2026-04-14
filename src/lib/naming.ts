/**
 * Naming-template interpolation. Templates live in constrained_values with
 * `category='naming_template'` and values like `{Sample}_{DNA/RNA}_{Number}`.
 *
 * Known tokens get substituted with whatever the caller knows (sample name,
 * gene, date, etc.). Unknown tokens like `{DNA/RNA}` are preserved verbatim
 * so the user sees the expected format and fills them in.
 */

/**
 * Replace `{Token}` placeholders in `template` using case-insensitive lookup
 * in `vars`. Tokens with no matching var are left as-is.
 */
export function applyNameTemplate(
	template: string,
	vars: Record<string, string | number | null | undefined>
): string {
	const lc: Record<string, string> = {};
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
