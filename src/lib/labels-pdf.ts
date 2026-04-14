/**
 * Avery 5160 label-sheet PDF generator. Shared by the Labels settings tab
 * (pre-printed, no primary text) and the cart "Print labels" action
 * (existing entities, label + id text). Dimensions in inches; letter-size
 * paper at 300+ DPI.
 */

export interface LabelInput {
	id: string;
	/** Entity type slug (project, site, sample, …). Rendered as an
	 *  uppercase tag at the top of each label so field workers can tell
	 *  at a glance what the sticker is for. Omit for fully-blank labels. */
	type?: string;
	/** Optional heading for the label (e.g. entity name). */
	primary?: string;
	/** Optional sub-line (e.g. project or site name). */
	secondary?: string;
}

const LABELS_PER_PAGE = 30;
const COLS = 3;
const CELL_W = 2.625;
const CELL_H = 1;
const MARGIN_TOP = 0.5;
const MARGIN_LEFT = 0.1875;
const GAP_X = 0.125;

/** Truncate a string to fit visually in the label text column at 8pt Courier.
 *  Rough char budget = 18; conservative cutoff avoids PDF overflow. */
function truncate(s: string | undefined, max: number): string {
	if (!s) return '';
	return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export async function buildLabelsPdf(
	labels: LabelInput[],
	origin: string,
	filename: string
): Promise<void> {
	const [{ default: jsPDF }, { default: QRCode }] = await Promise.all([
		import('jspdf'),
		import('qrcode')
	]);
	const pdf = new jsPDF({ unit: 'in', format: 'letter' });
	for (let i = 0; i < labels.length; i++) {
		const pageIdx = Math.floor(i / LABELS_PER_PAGE);
		const slot = i % LABELS_PER_PAGE;
		if (slot === 0 && pageIdx > 0) pdf.addPage();

		const col = slot % COLS;
		const row = Math.floor(slot / COLS);
		const x = MARGIN_LEFT + col * (CELL_W + GAP_X);
		const y = MARGIN_TOP + row * CELL_H;

		const { id, type, primary, secondary } = labels[i];

		// Embed the type into the QR URL so a scanner can skip the
		// claim-type picker and route straight to the right new-form.
		// Unknown-type labels encode just /id/<uuid>.
		const target = type
			? `${origin}/id/${id}?t=${encodeURIComponent(type)}`
			: `${origin}/id/${id}`;

		// Code block hugs the top 0.4" of the 1" cell, leaving the lower
		// 0.6" blank for handwritten annotations (date, depth, notes, etc.).
		const png = await QRCode.toDataURL(target, {
			margin: 1,
			width: 300,
			color: { dark: '#000000', light: '#ffffff' }
		});
		pdf.addImage(png, 'PNG', x + 0.05, y + 0.05, 0.35, 0.35);

		// Text column to the right of the small QR, vertically stacked:
		//   TYPE (bold) · primary · secondary · id halves
		const textX = x + 0.45;
		pdf.setFont('courier', 'normal');
		let cursor = y + 0.12;
		if (type) {
			pdf.setFont('helvetica', 'bold');
			pdf.setFontSize(8);
			pdf.text(type.toUpperCase().replace(/_/g, ' '), textX, cursor);
			cursor += 0.11;
			pdf.setFont('courier', 'normal');
		}
		if (primary) {
			pdf.setFontSize(7);
			pdf.text(truncate(primary, 32), textX, cursor);
			cursor += 0.1;
			if (secondary) {
				pdf.setFontSize(6);
				pdf.text(truncate(secondary, 38), textX, cursor);
				cursor += 0.09;
			}
		} else if (!type) {
			pdf.setFont('helvetica', 'normal');
			pdf.setFontSize(7);
			pdf.text('SampleTown', textX, cursor);
			cursor += 0.1;
			pdf.setFont('courier', 'normal');
		}
		pdf.setFontSize(5);
		// Only emit id text if there's room in the top strip. When the
		// label has a long primary+secondary the id falls on the line
		// below; cap at y + 0.42 so we never encroach on the writing area.
		if (cursor <= y + 0.34) {
			pdf.text(id.slice(0, 16), textX, cursor);
			cursor += 0.08;
			if (cursor <= y + 0.42) {
				pdf.text(id.slice(16), textX, cursor);
			}
		}
	}
	pdf.save(filename);
}
