import type { RequestHandler } from './$types';
import { exportMixsTsv } from '$lib/server/mixs-io';

export const GET: RequestHandler = async ({ url }) => {
	const projectId = url.searchParams.get('project_id') || undefined;
	const checklist = url.searchParams.get('checklist') || undefined;
	const envPackage = url.searchParams.get('env_package') || undefined;
	const format = url.searchParams.get('format') || 'tsv';

	const tsv = exportMixsTsv({ projectId, checklist, envPackage });

	if (format === 'preview') {
		return new Response(JSON.stringify({ tsv }), {
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const filename = `mixs_samples_${new Date().toISOString().slice(0, 10)}.tsv`;
	return new Response(tsv, {
		headers: {
			'Content-Type': 'text/tab-separated-values',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
