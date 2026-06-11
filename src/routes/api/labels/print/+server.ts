import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { requireLab } from '$lib/server/guards';
import { parseBody } from '$lib/server/validation';
import { apiError } from '$lib/server/api-errors';
import { PrintBody } from '$lib/server/schemas/labels';
import { buildLabelsZpl } from '$lib/labels-zpl';
import { getServerPrinter, printZplServer } from '$lib/server/zebra-print';

/**
 * Server-side Zebra printing. Used when the printer is attached to the host
 * running SampleTown (vs the browser-side Browser Print path). Opt-in per
 * deployment via ZEBRA_PRINTER / ZEBRA_DEVICE — returns "unavailable" where
 * no printer is configured (e.g. the cloud VM).
 */

// Availability probe for the Labels UI: is a server printer configured here?
export const GET: RequestHandler = async ({ locals }) => {
	requireLab(locals);
	const printer = getServerPrinter();
	return json({
		available: printer.configured,
		queue: printer.queue ?? null,
		device: printer.device ?? null
	});
};

export const POST: RequestHandler = async ({ request, locals, url }) => {
	requireLab(locals);

	const printer = getServerPrinter();
	if (!printer.configured) {
		throw error(503, 'No server-side printer configured on this deployment.');
	}

	const parsed = parseBody(PrintBody, await request.json().catch(() => null));
	if (!parsed.ok) return parsed.response;
	const { labels, config, origin: bodyOrigin } = parsed.data;

	try {
		// Prefer the client's own origin (so server-printed QR URLs match the
		// PDF/Browser-Print output exactly), then the canonical ORIGIN env,
		// then the request origin as a last resort.
		const origin = bodyOrigin || env.ORIGIN || url.origin;
		const zpl = buildLabelsZpl(labels, origin, config);
		await printZplServer(zpl);
		return json({ ok: true, count: labels.length });
	} catch (err) {
		return apiError(err);
	}
};
