import type { RequestHandler } from './$types';
import { chooseExportColumns } from '$lib/server/mixs-io';
import { MIXS_ACTIVE_VERSION } from '$lib/mixs/schema-index';

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

	const columns = chooseExportColumns(checklist, extension);
	const headerRow = columns.map((c) => c.header).join('\t');

	// Comment row identifies the schema version the template was generated
	// from — helps match round-trips across MIxS releases.
	const meta = `# MIxS ${MIXS_ACTIVE_VERSION} template — ${checklist}${extension ? ' + ' + extension : ''}`;
	const body = `${meta}\n${headerRow}\n`;

	const extSuffix = extension ? `_${extension}` : '';
	const filename = `mixs_${MIXS_ACTIVE_VERSION}_${checklist}${extSuffix}_template.tsv`;
	return new Response(body, {
		headers: {
			'Content-Type': 'text/tab-separated-values',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
