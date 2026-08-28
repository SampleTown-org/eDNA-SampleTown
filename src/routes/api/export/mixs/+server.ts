import type { RequestHandler } from './$types';
import { exportMixsTsv } from '$lib/server/mixs-io';
import { requireLab } from '$lib/server/guards';
import { sheetFormat } from '$lib/sheet-formats';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { labId } = requireLab(locals);
	const projectId = url.searchParams.get('project_id') || undefined;
	const checklist = url.searchParams.get('checklist') || undefined;
	const extension = url.searchParams.get('extension') || undefined;
	// `format` here is the response shape (a download or a JSON preview);
	// `sheet` is which columns the sheet carries.
	const format = url.searchParams.get('format') || 'tsv';
	const sheet = sheetFormat(url.searchParams.get('sheet'));

	const tsv = exportMixsTsv({ labId, projectId, checklist, extension, format: sheet.value });

	if (format === 'preview') {
		return new Response(JSON.stringify({ tsv }), {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const filename = `sampletown_${sheet.value}_${new Date().toISOString().slice(0, 10)}.tsv`;
	return new Response(tsv, {
		headers: {
			'Content-Type': 'text/tab-separated-values',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
