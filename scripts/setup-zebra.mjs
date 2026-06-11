#!/usr/bin/env node
/**
 * Provision a host-attached Zebra label printer for server-side printing.
 *
 * SampleTown can print ZPL labels two ways: browser-side via Zebra Browser
 * Print (operator's own laptop), or server-side to a printer plugged into
 * the box running SampleTown (a lab/ship server, the LAN dev instance). This
 * script sets up the server-side path in a portable way: it discovers the
 * USB Zebra via CUPS and creates a **raw** CUPS queue that passes ZPL through
 * untouched. The app then prints to it when `ZEBRA_PRINTER=<queue>` is set.
 *
 * CUPS (rather than writing to /dev/usb/lpN directly) is deliberate: the CUPS
 * daemon owns device permissions, so the Node server prints via `lp` without
 * being in the `lp` group; the queue survives a re-plug to a different USB
 * port; and it works the same on Linux and macOS.
 *
 * Usage (needs root for CUPS admin — run with sudo):
 *   sudo node scripts/setup-zebra.mjs                # discover + create queue "zebra"
 *   sudo node scripts/setup-zebra.mjs --name labels  # custom queue name
 *   sudo node scripts/setup-zebra.mjs --device 'usb://Zebra%20Technologies/...'  # skip discovery
 *   node scripts/setup-zebra.mjs --dry-run           # just print what it would do
 *
 * After it succeeds, add to the SampleTown server's .env and restart:
 *   ZEBRA_PRINTER=zebra
 */
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
function flag(name) {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : undefined;
}
const QUEUE = (flag('name') && flag('name') !== true ? flag('name') : 'zebra');
const FORCED_DEVICE = flag('device') && flag('device') !== true ? flag('device') : null;
const DRY_RUN = !!flag('dry-run');

const log = (...a) => console.log(...a);
const die = (msg, code = 1) => {
	console.error(`✗ ${msg}`);
	process.exit(code);
};

function run(cmd, cmdArgs, opts = {}) {
	if (DRY_RUN) {
		log(`  [dry-run] ${cmd} ${cmdArgs.join(' ')}`);
		return '';
	}
	return execFileSync(cmd, cmdArgs, { encoding: 'utf8', ...opts });
}

function has(cmd) {
	try {
		execFileSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

// --- preflight ---------------------------------------------------------------
if (!has('lpadmin') || !has('lpinfo') || !has('lpstat')) {
	die('CUPS tools (lpadmin/lpinfo/lpstat) not found. Install CUPS:\n  sudo apt install cups   # Debian/Ubuntu');
}
if (!DRY_RUN && typeof process.getuid === 'function' && process.getuid() !== 0) {
	die('CUPS admin needs root. Re-run with:\n  sudo node scripts/setup-zebra.mjs ' + args.join(' '));
}

// --- discover the printer URI ------------------------------------------------
let uri = FORCED_DEVICE;
if (!uri) {
	log('• Discovering USB Zebra printers via `lpinfo -v`…');
	let raw = '';
	try {
		raw = execFileSync('lpinfo', ['-v'], { encoding: 'utf8' });
	} catch (e) {
		die(`lpinfo failed: ${e.message}`);
	}
	// Lines look like: "direct usb://Zebra%20Technologies/ZTC%20ZD421-203dpi%20ZPL?serial=..."
	const candidates = raw
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => /usb:/i.test(l) && /zebra|ztc|zd4/i.test(l))
		.map((l) => l.split(/\s+/).slice(1).join(' '));

	if (candidates.length === 0) {
		die(
			'No USB Zebra found. Is it powered on and plugged in? Check `lpinfo -v` output manually,\nthen pass the URI with --device "usb://…".'
		);
	}
	if (candidates.length > 1) {
		log('  Multiple Zebra printers found — re-run with --device set to one of:');
		candidates.forEach((c) => log(`    ${c}`));
		process.exit(2);
	}
	uri = candidates[0];
	log(`  Found: ${decodeURIComponent(uri)}`);
}

// --- create (or update) the raw queue ----------------------------------------
let exists = false;
try {
	execFileSync('lpstat', ['-p', QUEUE], { stdio: 'ignore' });
	exists = true;
} catch {
	/* queue doesn't exist yet */
}
log(`• ${exists ? 'Updating' : 'Creating'} raw CUPS queue "${QUEUE}" → ${decodeURIComponent(uri)}`);

try {
	// -E enables + accepts jobs; -m raw = no driver, ZPL passes through verbatim.
	run('lpadmin', ['-p', QUEUE, '-E', '-v', uri, '-m', 'raw']);
} catch (e) {
	die(
		`lpadmin failed: ${e.message}\n` +
			"If it complains about the 'raw' model, your CUPS lacks it — install `cups-filters`,\n" +
			'or create the queue in the CUPS web UI (http://localhost:631) as "Raw".'
	);
}

// Make sure it's enabled + accepting (harmless if already so).
try {
	run('cupsenable', [QUEUE]);
	run('cupsaccept', [QUEUE]);
} catch {
	/* -E usually covers this; ignore */
}

// --- done --------------------------------------------------------------------
log('');
log(`✓ Queue "${QUEUE}" is ready.`);
log('');
log('Next steps:');
log(`  1. Add to the SampleTown server .env and restart the app:`);
log(`       ZEBRA_PRINTER=${QUEUE}`);
log(`  2. Load media + ribbon, then test from the shell (no app needed):`);
log(`       printf '^XA^FO40,40^A0N,40,40^FDSampleTown test^FS^XZ' | lp -d ${QUEUE} -o raw`);
log(`  3. In SampleTown: Manage → Labels → "Print via: Server printer".`);
if (DRY_RUN) log('\n(dry-run: nothing was changed)');
