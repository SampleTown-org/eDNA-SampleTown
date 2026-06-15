/**
 * Sample-template helpers (server). A template's `params` is a JSON array of
 * `{ key, value? }`: key is a MIxS slot name or `misc_param:<tag>`; value is an
 * optional pre-fill the wizard seeds (still editable). See schema.sql
 * `sample_templates` and docs/dev/offline-pwa.md.
 */

export interface TemplateParam {
	key: string;
	value?: string;
}

/** Normalize a client params payload into a JSON string of [{key, value?}],
 *  dropping blanks/dupes and unknown fields. */
export function serializeParams(raw: unknown): string {
	if (!Array.isArray(raw)) return '[]';
	const seen = new Set<string>();
	const out: TemplateParam[] = [];
	for (const p of raw as Array<{ key?: unknown; value?: unknown }>) {
		const key = typeof p?.key === 'string' ? p.key.trim() : '';
		if (!key || seen.has(key)) continue;
		seen.add(key);
		const value = typeof p?.value === 'string' && p.value.trim() !== '' ? p.value.trim() : undefined;
		out.push(value === undefined ? { key } : { key, value });
	}
	return JSON.stringify(out);
}
