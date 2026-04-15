/**
 * Helpers for exporting plate layouts: TSV download + print-friendly window.
 * Used from PCR plate (/pcr/[id]) and library plate (/libraries/[id]) detail
 * pages. All client-side — TSV is a Blob, print is a popup window the
 * operator prints via the browser's native print dialog (Ctrl+P → Save as PDF
 * for a PDF, or send to a real printer).
 */

export type PlateFormat = 8 | 96 | 384;

const ROW_LETTERS = 'ABCDEFGHIJKLMNOP';
const LAYOUTS: Record<PlateFormat, { rows: number; cols: number }> = {
	8: { rows: 1, cols: 8 },
	96: { rows: 8, cols: 12 },
	384: { rows: 16, cols: 24 }
};

/** Detect plate format from the largest occupied well — `H12` → 96, `P24`
 *  → 384, `A08` → 8. Falls back to 96 when no wells are placed. */
export function detectPlateFormat(wellLabels: (string | null | undefined)[]): PlateFormat {
	let maxRow = 0;
	let maxCol = 0;
	for (const w of wellLabels) {
		if (!w) continue;
		const rowIdx = ROW_LETTERS.indexOf(w[0]);
		const col = parseInt(w.slice(1), 10);
		if (rowIdx >= 0 && rowIdx > maxRow) maxRow = rowIdx;
		if (!Number.isNaN(col) && col > maxCol) maxCol = col;
	}
	if (maxRow > 7 || maxCol > 12) return 384;
	if (maxRow > 0 || maxCol > 8) return 96;
	return 8;
}

/** Trigger a TSV file download in the browser. Headers + rows arrive as
 *  plain arrays; values are coerced to string and tab/newline characters
 *  are stripped to keep the file parseable. */
export function downloadTSV(
	filename: string,
	headers: string[],
	rows: (string | number | null | undefined)[][]
) {
	const escape = (v: unknown) =>
		v == null ? '' : String(v).replace(/[\t\r\n]/g, ' ');
	const lines = [headers.map(escape).join('\t')];
	for (const r of rows) lines.push(r.map(escape).join('\t'));
	const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/tab-separated-values' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

/** Per-cell content for the printable plate grid. Empty wells render blank. */
export type PrintCell = { primary: string; secondary?: string };

/**
 * Open a popup window with a print-friendly plate layout and trigger the
 * browser print dialog. The grid scales with format so 384-well still fits
 * on a single landscape page; per-cell font shrinks accordingly.
 *
 * `wellMap` is keyed by the same well_label format used elsewhere
 * (e.g. `A01`, `H12`, `P24`).
 */
export function openPrintWindow(opts: {
	title: string;
	subtitle?: string;
	format: PlateFormat;
	wellMap: Record<string, PrintCell>;
}) {
	const { title, subtitle, format, wellMap } = opts;
	const { rows, cols } = LAYOUTS[format];

	// Cell sizing in mm so the grid fits a US Letter landscape page
	// (printable area ≈ 250mm × 175mm with 18mm margins). Per-format sizes
	// are picked to leave room for the title + row/col headers without
	// overflowing onto a second page.
	const cellSize = format === 8 ? 28 : format === 96 ? 20 : 9.5;
	const cellFont = format === 8 ? '14pt' : format === 96 ? '9pt' : '5.5pt';
	const wellFont = format === 8 ? '8pt' : format === 96 ? '6pt' : '4pt';

	const headerCols = Array.from({ length: cols }, (_, i) => `<th>${i + 1}</th>`).join('');
	const bodyRows = Array.from({ length: rows }, (_, r) => {
		const letter = ROW_LETTERS[r];
		const cells = Array.from({ length: cols }, (_, c) => {
			const well = `${letter}${String(c + 1).padStart(2, '0')}`;
			const item = wellMap[well];
			if (!item) return `<td class="empty"><span class="well">${well}</span></td>`;
			return `<td><span class="well">${well}</span><div class="primary">${escapeHtml(item.primary)}</div></td>`;
		}).join('');
		return `<tr><th>${letter}</th>${cells}</tr>`;
	}).join('');

	const html = `<!doctype html>
<html>
<head>
	<meta charset="utf-8" />
	<title>${escapeHtml(title)}</title>
	<style>
		* { box-sizing: border-box; }
		body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 0; margin: 0; color: #111; }
		h1 { font-size: 14pt; margin: 0 0 2mm; }
		.subtitle { font-size: 9pt; color: #555; margin-bottom: 4mm; }
		table { border-collapse: collapse; table-layout: fixed; }
		th { font-weight: 500; font-size: 7pt; color: #555; padding: 0 2px; text-align: center; }
		td {
			border: 0.3mm solid #888;
			width: ${cellSize}mm;
			height: ${cellSize}mm;
			vertical-align: top;
			padding: 0.5mm;
			font-size: ${cellFont};
			line-height: 1.05;
			overflow: hidden;
		}
		td.empty { background: #f5f5f5; }
		.well { font-size: ${wellFont}; color: #999; display: block; }
		.primary { font-weight: 600; word-break: break-all; }
		.print-instructions { font-size: 9pt; color: #999; padding: 4mm; }
		@media print {
			.print-instructions { display: none; }
		}
		@page { size: letter landscape; margin: 12mm; }
		@media screen {
			body { padding: 16px; }
		}
	</style>
</head>
<body>
	<h1>${escapeHtml(title)}</h1>
	${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ''}
	<table>
		<thead><tr><th></th>${headerCols}</tr></thead>
		<tbody>${bodyRows}</tbody>
	</table>
	<p class="print-instructions">Use your browser's print dialog (Ctrl+P / ⌘P) — pick "Save as PDF" as the destination if you want a file rather than a hard copy. Page is sized for US Letter landscape.</p>
	<script>setTimeout(() => window.print(), 200);</script>
</body>
</html>`;

	const win = window.open('', '_blank', 'width=1100,height=750');
	if (!win) {
		alert('Pop-up blocked — allow pop-ups for this site to print plate layouts.');
		return;
	}
	win.document.open();
	win.document.write(html);
	win.document.close();
}

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}
