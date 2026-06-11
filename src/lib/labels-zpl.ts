/**
 * ZPL II label generator for Zebra desktop thermal printers (ZD421 etc.).
 *
 * Counterpart to `labels-pdf.ts`: same `LabelInput` shape and same encoded
 * URL (`<origin>/id/<uuid>[?t=<type>]`), but emits raw ZPL instead of an
 * Avery PDF. The QR is rendered natively by the printer via `^BQ` — no
 * client-side raster — so it comes out crisp at the full printhead
 * resolution and we don't ship a bitmap over the wire.
 *
 * Output is a single ZPL string: one `^XA … ^XZ` block per label. The
 * printer's media sensor handles the gap/feed between labels, so a batch is
 * just the blocks concatenated. Send it to the printer with the Browser
 * Print client (`zebra-browser-print.ts`) or save it as a `.zpl` file for
 * offline testing (drag onto the printer's USB mass-storage, or paste into
 * labelary.com to preview without media).
 */

import type { LabelInput } from './labels-pdf';

export type EcLevel = 'L' | 'M' | 'Q' | 'H';

export interface ZebraConfig {
	/** Printhead resolution. ZD421 ships 203 (8 dots/mm) or 300 (12 dots/mm). */
	dpi: 203 | 300;
	/** Label width in inches (across the print direction). */
	widthIn: number;
	/** Label height/length in inches (along the feed direction). */
	heightIn: number;
	/**
	 * Burn darkness, ZPL `^MD` (0–30). Higher = darker. Thermal-transfer
	 * ribbon usually wants more than direct-thermal. Undefined leaves the
	 * printer's configured default untouched.
	 */
	darkness?: number;
	/** Print speed in inches/sec, ZPL `^PR`. ZD421 tops out at 6. */
	speedIps?: number;
	/**
	 * QR error-correction level. Higher tolerates more scuffing/frost on a
	 * tube at the cost of QR capacity. 'M' (~15%) is a good default for our
	 * ~60–80 char URLs; bump to 'Q' for cryo labels that get abused.
	 */
	ecLevel?: EcLevel;
	/**
	 * QR module magnification (1–10), ZPL `^BQ` param. 0 / undefined = auto:
	 * pick the largest magnification whose worst-case symbol still fits the
	 * label height. Override only if auto over/under-shoots for your stock.
	 */
	magnification?: number;
}

export const DEFAULT_ZEBRA_CONFIG: ZebraConfig = {
	dpi: 203,
	widthIn: 2.25,
	heightIn: 1.25,
	darkness: 12,
	speedIps: 4,
	ecLevel: 'M',
	magnification: 0
};

/** Inner padding so nothing prints in the dead zone at the label edge. */
const MARGIN_IN = 0.06;
/** Gap between the QR block and the text column. */
const GAP_IN = 0.08;
/**
 * Worst-case QR footprint in modules (symbol + a little quiet zone) used to
 * size auto-magnification. Our longest URL — origin + `/id/` + 32 hex +
 * `?t=library_plate` — lands around QR version 6 (≈41 modules) in byte mode
 * at EC level M; 50 leaves headroom + quiet zone so the symbol never spills
 * off a short label.
 */
const WORST_CASE_MODULES = 50;

const round = (n: number) => Math.round(n);

/**
 * Strip the three ZPL field delimiters from human text so a stray caret,
 * tilde, or backslash in an entity name can't be read as a command. QR data
 * is sanitized separately (see below) since it must round-trip exactly.
 */
function zplText(s: string | undefined): string {
	if (!s) return '';
	return s.replace(/[\^~\\]/g, ' ').trim();
}

/** Truncate to a rough character budget so long names don't overrun the column. */
function truncate(s: string, max: number): string {
	return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/**
 * The QR payload is a URL we generated, so it won't legitimately contain
 * `^`, `~`, or a leading `,` — but guard anyway: a `,` immediately after the
 * `^FD<EC><mode>,` switch prefix would be read as an empty data field. We
 * never put one there, so this is belt-and-suspenders.
 */
function zplQrData(s: string): string {
	return s.replace(/[\^~]/g, '');
}

function qrUrl(origin: string, id: string, type?: string): string {
	return type ? `${origin}/id/${id}?t=${encodeURIComponent(type)}` : `${origin}/id/${id}`;
}

/** Build the ZPL for a single label as one `^XA … ^XZ` block. */
function buildOne(label: LabelInput, origin: string, cfg: ZebraConfig): string {
	const { dpi } = cfg;
	const dots = (inches: number) => round(inches * dpi);

	const pw = dots(cfg.widthIn);
	const ll = dots(cfg.heightIn);
	const margin = dots(MARGIN_IN);
	const gap = dots(GAP_IN);

	// QR occupies a square as tall as the label allows.
	const qrBox = ll - 2 * margin;
	const autoMag = Math.max(1, Math.min(10, Math.floor(qrBox / WORST_CASE_MODULES)));
	const mag = cfg.magnification && cfg.magnification > 0 ? cfg.magnification : autoMag;
	const ecl: EcLevel = cfg.ecLevel ?? 'M';

	const qrX = margin;
	const qrY = margin;

	const data = zplQrData(qrUrl(origin, label.id, label.type));

	// Text column: starts right of the QR box, runs to the right margin.
	const textX = qrX + qrBox + gap;
	const textW = pw - textX - margin;

	const lines: string[] = ['^XA', '^CI28', `^PW${pw}`, `^LL${ll}`, '^LH0,0'];
	if (cfg.darkness != null) lines.push(`^MD${cfg.darkness}`);
	if (cfg.speedIps != null) lines.push(`^PR${cfg.speedIps}`);

	// QR — `^BQ<orient>,<model>,<mag>`; field data prefix `<EC><mode>,` is
	// MANDATORY (omitting it makes the printer eat the first chars as switches).
	lines.push(`^FO${qrX},${qrY}^BQN,2,${mag}^FD${ecl}A,${data}^FS`);

	// Text fields, stacked top-down, mirroring the PDF layout.
	let cursor = margin;
	if (label.type) {
		const h = dots(0.13);
		lines.push(
			`^FO${textX},${cursor}^A0N,${h},${h}^FB${textW},1,0,L^FD${zplText(
				label.type.replace(/_/g, ' ').toUpperCase()
			)}^FS`
		);
		cursor += h + dots(0.02);
	}
	if (label.secondary) {
		const h = dots(0.1);
		lines.push(
			`^FO${textX},${cursor}^A0N,${h},${h}^FB${textW},1,0,L^FD${truncate(
				zplText(label.secondary),
				26
			)}^FS`
		);
		cursor += h + dots(0.02);
	}
	if (label.primary) {
		const h = dots(0.12);
		// ^FB wraps within the text column; cap at 2 lines.
		lines.push(
			`^FO${textX},${cursor}^A0N,${h},${h}^FB${textW},2,0,L^FD${zplText(label.primary)}^FS`
		);
		cursor += h * 2 + dots(0.02);
	}
	// Short id at the bottom of the column for eyeball matching.
	const idH = dots(0.09);
	const idY = Math.min(cursor, ll - margin - idH);
	lines.push(`^FO${textX},${idY}^A0N,${idH},${idH}^FD${label.id.slice(0, 8)}^FS`);

	lines.push('^XZ');
	return lines.join('\n');
}

/**
 * Build a ZPL document for a batch of labels. Returns the raw ZPL string —
 * the caller sends it to Browser Print or downloads it as `.zpl`.
 */
export function buildLabelsZpl(labels: LabelInput[], origin: string, cfg: ZebraConfig): string {
	return labels.map((l) => buildOne(l, origin, cfg)).join('\n');
}
