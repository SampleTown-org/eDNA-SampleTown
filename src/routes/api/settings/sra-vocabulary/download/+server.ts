import type { RequestHandler } from './$types';
import { ensureSraXlsx } from '$lib/server/sra-vocabulary';
import { readFileSync, existsSync } from 'fs';

/** Serve the cached SRA_metadata.xlsx as a download. */
export const GET: RequestHandler = async () => {
	const path = await ensureSraXlsx();
	if (!existsSync(path)) {
		return new Response('SRA metadata file not available', { status: 404 });
	}
	const buf = readFileSync(path);
	return new Response(buf, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': 'attachment; filename="SRA_metadata.xlsx"'
		}
	});
};
