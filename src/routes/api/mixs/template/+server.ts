import type { RequestHandler } from './$types';
import { sheetColumns } from '$lib/server/sheet-columns';
import { MIXS_ACTIVE_VERSION } from '$lib/mixs/schema-index';
import { sheetFormat } from '$lib/sheet-formats';

/**
 * Empty TSV template for a given (checklist, extension) pair, generated from
 * the SampleTown-bundled MIxS LinkML schema. Column order and `*` prefixes
 * match the GSC MIxS v6.3 template convention: required slots first (with
 * leading `*`), then optional slots, then SampleTown carry-through metadata.
 *
 * Operators download a template, fill it in, then import it back — the
 * column mapper auto-recognizes every header.
 *
 *   GET /api/mixs/template?checklist=MimarksS&extension=Water
 */
export const GET: RequestHandler = async ({ url }) => {
	const checklist = url.searchParams.get('checklist') ?? 'MimarksS';
	const extension = url.searchParams.get('extension') ?? undefined;
	const sheet = sheetFormat(url.searchParams.get('sheet'));

	const columns = sheetColumns(sheet.value, checklist, extension);
	const headerRow = columns.map((c) => c.header).join('\t');
	// Second row names each column's vocabulary, as an exported sheet does. The
	// importer strips it, so a filled template reads back the same way.
	const vocabRow = columns.map((c) => c.vocabulary).join('\t');

	// Comment row says what the template is and, where the columns came from a
	// MIxS class, which release — round-trips across releases are easier to
	// match up when the sheet says so.
	const scope = sheet.usesChecklist
		? `${checklist}${extension ? ' + ' + extension : ''}, MIxS ${MIXS_ACTIVE_VERSION} — `
		: '';
	const meta = `# ${sheet.label} template — ${scope}one row per ${sheet.grain}`;
	const body = `${meta}\n${headerRow}\n${vocabRow}\n`;

	const scopeSuffix = sheet.usesChecklist
		? `_${checklist}${extension ? '_' + extension : ''}`
		: '';
	const filename = `sampletown_${sheet.value}${scopeSuffix}_template.tsv`;
	return new Response(body, {
		headers: {
			'Content-Type': 'text/tab-separated-values',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
