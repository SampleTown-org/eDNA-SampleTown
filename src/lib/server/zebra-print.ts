/**
 * Server-side ZPL printing for a host-attached Zebra printer.
 *
 * Counterpart to the browser-side `zebra-browser-print.ts`: used when the
 * printer is plugged into the box running SampleTown (a lab/ship server, the
 * LAN dev instance) rather than into the operator's laptop. The route at
 * `/api/labels/print` builds ZPL with the shared `buildLabelsZpl` and hands
 * it here.
 *
 * Portability: opt-in per deployment via env, off by default — so the cloud
 * VM (no printer) simply reports "not configured" and the feature stays dark
 * there. Two ways to point at the printer:
 *
 *   ZEBRA_PRINTER=zebra      # a CUPS queue name (preferred — see
 *                            # scripts/setup-zebra.mjs to create one)
 *   ZEBRA_DEVICE=/dev/usb/lp2  # a raw character device (fallback)
 *
 * CUPS is preferred because the CUPS daemon owns the device permissions, so
 * the Node process prints via `lp` without needing to be in the `lp` group
 * (raw device writes do need that group). It's also cross-platform (macOS
 * included) and survives the printer being re-plugged to a new USB port.
 */

import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { env } from '$env/dynamic/private';

export interface ServerPrinter {
	configured: boolean;
	/** CUPS queue name, when ZEBRA_PRINTER is set. */
	queue?: string;
	/** Raw device path, when ZEBRA_DEVICE is set (and no queue). */
	device?: string;
}

/** Resolve the configured server printer from env. Queue wins over device. */
export function getServerPrinter(): ServerPrinter {
	const queue = env.ZEBRA_PRINTER?.trim();
	const device = env.ZEBRA_DEVICE?.trim();
	if (queue) return { configured: true, queue };
	if (device) return { configured: true, device };
	return { configured: false };
}

/** Pipe raw ZPL to a CUPS queue via `lp -d <queue> -o raw`. */
function lpPrint(queue: string, zpl: string): Promise<void> {
	return new Promise((resolve, reject) => {
		// Args are passed as an array (no shell) and the queue name comes from
		// trusted env, so there's no command-injection surface.
		const child = spawn('lp', ['-d', queue, '-o', 'raw'], {
			stdio: ['pipe', 'ignore', 'pipe']
		});
		let stderr = '';
		child.stderr.on('data', (d) => (stderr += d.toString()));
		child.on('error', (e) =>
			reject(
				e.message.includes('ENOENT')
					? new Error('`lp` not found — CUPS is not installed on this host.')
					: e
			)
		);
		child.on('close', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`lp exited ${code}: ${stderr.trim() || 'unknown error'}`));
		});
		child.stdin.write(zpl);
		child.stdin.end();
	});
}

/**
 * Send a ZPL document to the configured server printer. Throws if no printer
 * is configured (callers should gate on `getServerPrinter().configured`) or
 * on a transport failure.
 */
export async function printZplServer(zpl: string): Promise<void> {
	const printer = getServerPrinter();
	if (!printer.configured) {
		throw new Error('No server printer configured (set ZEBRA_PRINTER or ZEBRA_DEVICE).');
	}
	if (printer.queue) {
		await lpPrint(printer.queue, zpl);
	} else if (printer.device) {
		// Raw device write needs the server process to be in the `lp` group.
		await writeFile(printer.device, zpl, { encoding: 'latin1' });
	}
}
