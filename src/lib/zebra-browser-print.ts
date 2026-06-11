/**
 * Minimal client for Zebra Browser Print.
 *
 * Browser Print is a small agent the operator installs on the workstation
 * the printer is plugged into (USB). It exposes a loopback HTTP service that
 * bridges the browser to the printer, so SampleTown can send raw ZPL from
 * the page even though the app itself is served from the cloud VM — the
 * print path never leaves the local machine. Download:
 *   https://www.zebra.com/us/en/support-downloads/printer-software/browser-print.html
 *
 * We talk to the loopback service directly rather than vendoring Zebra's
 * minified SDK. Two facts keep this dependency-free and CORS-clean:
 *  - the service answers with `Access-Control-Allow-Origin: *`, and
 *  - we POST ZPL as `text/plain` with no custom headers, which is a CORS
 *    "simple request" — no preflight, which the agent doesn't answer.
 *
 * Mixed content: SampleTown is HTTPS and this is `http://127.0.0.1`.
 * Chromium treats loopback as a trustworthy context and does NOT block it,
 * so USB printing works in Chrome/Edge as-is. Firefox/Safari are stricter;
 * point `baseUrl` at the TLS port (`https://127.0.0.1:9101`) there, which
 * Browser Print also serves.
 */

/** A printer as reported by the Browser Print agent. Opaque — pass it back verbatim to `printZpl`. */
export interface ZebraDevice {
	name: string;
	uid: string;
	connection: string;
	deviceType: string;
	provider?: string;
	manufacturer?: string;
	version?: number;
}

/** Default loopback endpoint for the Browser Print agent (HTTP). */
export const DEFAULT_BASE_URL = 'http://127.0.0.1:9100';

/** Fetch with a hard timeout so a missing agent fails fast instead of hanging the UI. */
async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), ms);
	try {
		return await fetch(url, { ...init, signal: ctrl.signal });
	} finally {
		clearTimeout(timer);
	}
}

/** True if the Browser Print agent is reachable. Never throws. */
export async function isAvailable(baseUrl = DEFAULT_BASE_URL): Promise<boolean> {
	try {
		const res = await fetchWithTimeout(`${baseUrl}/available`, { method: 'GET' }, 1500);
		return res.ok;
	} catch {
		return false;
	}
}

/** The agent returns either a bare device object or an array; normalize to one. */
function firstDevice(payload: unknown): ZebraDevice | null {
	if (!payload) return null;
	if (Array.isArray(payload)) return (payload[0] as ZebraDevice) ?? null;
	return payload as ZebraDevice;
}

/**
 * The operator's default Zebra printer, or null if the agent is down or no
 * printer is set as default. Never throws.
 */
export async function getDefaultPrinter(baseUrl = DEFAULT_BASE_URL): Promise<ZebraDevice | null> {
	try {
		const res = await fetchWithTimeout(
			`${baseUrl}/default?type=printer`,
			{ method: 'GET' },
			2000
		);
		if (!res.ok) return null;
		const text = (await res.text()).trim();
		if (!text) return null;
		// Older agent builds return the device as a JSON string; newer as JSON.
		try {
			return firstDevice(JSON.parse(text));
		} catch {
			return { name: text, uid: text, connection: 'unknown', deviceType: 'printer' };
		}
	} catch {
		return null;
	}
}

/** Every printer the agent can see, so the UI can offer a picker. Never throws. */
export async function getAvailablePrinters(baseUrl = DEFAULT_BASE_URL): Promise<ZebraDevice[]> {
	try {
		const res = await fetchWithTimeout(`${baseUrl}/available`, { method: 'GET' }, 2000);
		if (!res.ok) return [];
		const data = await res.json();
		// Shape: { printer: ZebraDevice[], scale: [...], ... }
		const printers = (data?.printer ?? data?.printers ?? []) as ZebraDevice[];
		return Array.isArray(printers) ? printers : [];
	} catch {
		return [];
	}
}

/**
 * Send raw ZPL to a device. Throws on transport failure so the caller can
 * surface a message. The body is JSON but sent as `text/plain` to stay a
 * CORS simple request; the agent parses it regardless.
 */
export async function printZpl(
	device: ZebraDevice,
	zpl: string,
	baseUrl = DEFAULT_BASE_URL
): Promise<void> {
	const res = await fetchWithTimeout(
		`${baseUrl}/write`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
			body: JSON.stringify({ device, data: zpl })
		},
		8000
	);
	if (!res.ok) {
		throw new Error(`Browser Print returned ${res.status} ${res.statusText}`);
	}
}
