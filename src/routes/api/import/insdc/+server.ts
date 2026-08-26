import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkRate } from '$lib/server/rate-limit';
import { apiError } from '$lib/server/api-errors';
import { requireLab } from '$lib/server/guards';
import { fetchInsdc, rowsToTsv, MAX_ACCESSIONS } from '$lib/server/insdc';

/**
 * Fetch sample metadata straight from the sequence archives.
 *
 *   POST /api/import/insdc  { accessions: "PRJNA123456 SAMN0000001" }
 *
 * Returns a TSV in SampleTown's import columns plus an account of what each
 * accession resolved to. The TSV is not inserted here — the caller posts it to
 * /api/import/mixs, so an archive import gets the same dry-run preview, column
 * mapper, MIxS validation, and site clustering as a spreadsheet upload.
 *
 * Rate-limited to 1 request / 3 s / IP. Every call fans out to EBI and NCBI,
 * and both ask that clients stay well under a few requests per second.
 */
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
	requireLab(locals);

	const ip = getClientAddress();
	if (!checkRate(`insdc:${ip}`, 1, 3_000)) {
		return json(
			{ error: 'Too many archive lookups — wait a moment and try again' },
			{ status: 429 }
		);
	}

	let raw: unknown;
	try {
		const body = await request.json();
		raw = body?.accessions;
	} catch (err) {
		return apiError(err);
	}

	// Accept a pasted blob or a list — people copy accessions out of papers and
	// spreadsheets, separated by whatever that source used.
	const accessions = (Array.isArray(raw) ? raw.join(' ') : String(raw ?? ''))
		.split(/[\s,;]+/)
		.map((a) => a.trim())
		.filter(Boolean);

	if (accessions.length === 0) {
		return json({ error: 'At least one accession is required' }, { status: 400 });
	}
	if (accessions.length > MAX_ACCESSIONS) {
		return json(
			{ error: `Too many accessions (got ${accessions.length}, max ${MAX_ACCESSIONS})` },
			{ status: 413 }
		);
	}

	try {
		const result = await fetchInsdc(accessions);
		return json({
			tsv: result.rows.length > 0 ? rowsToTsv(result.rows, result.headers) : '',
			headers: result.headers,
			count: result.rows.length,
			warnings: result.warnings,
			resolved: result.resolved
		});
	} catch (err) {
		console.error('[insdc] fetch failed', err);
		return json(
			{ error: `Archive lookup failed: ${err instanceof Error ? err.message : String(err)}` },
			{ status: 502 }
		);
	}
};
