<script lang="ts">
	import { onMount } from 'svelte';

	/**
	 * Avery 5160 layout: 30 labels per letter-size page (3 cols × 10 rows),
	 * 1" × 2⅝" each with a 0.125" horizontal gap and 0.5" top/bottom margin.
	 * These dimensions drive both the PDF export and the on-screen preview
	 * so users see what they're going to print.
	 */
	const LABELS_PER_PAGE = 30;
	const COLS = 3;
	const ROWS = 10;
	const CELL_W = 2.625; // inches
	const CELL_H = 1;
	const MARGIN_TOP = 0.5;
	const MARGIN_LEFT = 0.1875;
	const GAP_X = 0.125;

	/** Generate a 32-char hex id matching our DB format (plain hex, no
	 *  dashes — same as generateId() server-side). */
	function mintId(): string {
		const bytes = new Uint8Array(16);
		crypto.getRandomValues(bytes);
		return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
	}

	let pages = $state(1);
	let ids = $state<string[]>([]);
	let previewSvgs = $state<string[]>([]);
	let origin = $state('');
	let busy = $state(false);

	const totalLabels = $derived(pages * LABELS_PER_PAGE);

	async function generate() {
		busy = true;
		try {
			const { default: QRCode } = await import('qrcode');
			const fresh = Array.from({ length: totalLabels }, mintId);
			// Small SVG per label for the on-screen preview — PDF export renders
			// its own higher-resolution PNG per label.
			const svgs = await Promise.all(
				fresh.map((id) =>
					QRCode.toString(`${origin}/id/${id}`, {
						type: 'svg',
						margin: 1,
						width: 160,
						color: { dark: '#000000', light: '#ffffff' }
					})
				)
			);
			ids = fresh;
			previewSvgs = svgs;
		} finally {
			busy = false;
		}
	}

	async function downloadPdf() {
		if (ids.length === 0) return;
		busy = true;
		try {
			const [{ default: jsPDF }, { default: QRCode }] = await Promise.all([
				import('jspdf'),
				import('qrcode')
			]);
			const pdf = new jsPDF({ unit: 'in', format: 'letter' });
			for (let i = 0; i < ids.length; i++) {
				const pageIdx = Math.floor(i / LABELS_PER_PAGE);
				const slot = i % LABELS_PER_PAGE;
				if (slot === 0 && pageIdx > 0) pdf.addPage();

				const col = slot % COLS;
				const row = Math.floor(slot / COLS);
				const x = MARGIN_LEFT + col * (CELL_W + GAP_X);
				const y = MARGIN_TOP + row * CELL_H;

				// Render QR as PNG data URL at 3x the display resolution so it
				// stays crisp when the PDF is printed at 300+ DPI.
				const png = await QRCode.toDataURL(`${origin}/id/${ids[i]}`, {
					margin: 1,
					width: 300,
					color: { dark: '#000000', light: '#ffffff' }
				});

				// QR fills the left 0.9" square of the 1" × 2.625" cell, padded
				// by 0.05" so it doesn't touch the label edge.
				pdf.addImage(png, 'PNG', x + 0.05, y + 0.05, 0.9, 0.9);

				// Text block to the right of the QR.
				pdf.setFont('courier', 'normal');
				pdf.setFontSize(8);
				pdf.text('SampleTown', x + 1.05, y + 0.18);
				pdf.setFontSize(7);
				pdf.text(ids[i].slice(0, 16), x + 1.05, y + 0.55);
				pdf.text(ids[i].slice(16), x + 1.05, y + 0.72);
			}
			const ts = new Date().toISOString().slice(0, 10);
			pdf.save(`sampletown-labels-${ts}.pdf`);
		} finally {
			busy = false;
		}
	}

	function exportCsv() {
		const header = 'id,url\n';
		const rows = ids.map((id) => `${id},${origin}/id/${id}`).join('\n');
		const blob = new Blob([header + rows + '\n'], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `sampletown-labels-${new Date().toISOString().slice(0, 10)}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	onMount(() => {
		origin = window.location.origin;
	});
</script>

<div class="space-y-4">
	<div class="rounded-lg border border-slate-800 p-4 space-y-3">
		<p class="text-sm text-slate-300">
			Generate a sheet of QR-coded stickers for pre-printing. Each label encodes
			<code class="text-xs text-slate-400">{origin || 'https://…'}/id/&lt;uuid&gt;</code>
			— scan one later to claim it (sample, site, project, etc.). PDF output is
			sized for <strong>Avery 5160</strong> (US Letter, 1″ × 2⅝″, 30 per page).
		</p>

		<div class="flex items-end gap-3 flex-wrap">
			<label class="block">
				<span class="block text-xs text-slate-400 mb-1">Pages (30 labels each)</span>
				<input
					type="number"
					min="1"
					max="50"
					bind:value={pages}
					class="w-24 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500"
				/>
			</label>
			<div class="text-xs text-slate-500 pb-2">= {totalLabels} labels</div>
			<button
				type="button"
				onclick={generate}
				disabled={busy}
				class="px-3 py-1.5 bg-ocean-600 text-white rounded hover:bg-ocean-500 transition-colors text-sm font-medium disabled:opacity-50"
			>
				{busy && ids.length === 0 ? 'Generating…' : ids.length > 0 ? 'Regenerate' : 'Generate'}
			</button>
			{#if ids.length > 0}
				<button
					type="button"
					onclick={downloadPdf}
					disabled={busy}
					class="px-3 py-1.5 bg-ocean-600 text-white rounded hover:bg-ocean-500 transition-colors text-sm font-medium disabled:opacity-50"
				>{busy ? 'Building PDF…' : 'Download PDF'}</button>
				<button
					type="button"
					onclick={exportCsv}
					class="px-3 py-1.5 border border-slate-700 text-slate-400 rounded hover:bg-slate-800 transition-colors text-sm"
					title="id,url CSV of every code issued — save alongside the printed sheet so you can look up which UUIDs you printed"
				>Export CSV</button>
			{/if}
		</div>
		<p class="text-xs text-slate-500">
			Ids are minted client-side. They're claimed when a scan routes to the new-entity form; unclaimed ids never touch the database, so over-printing is free. Zebra-printer wiring is planned for a future update.
		</p>
	</div>

	{#if ids.length > 0}
		<!-- On-screen preview of the first page (to sanity-check layout before
		     printing). Additional pages are in the PDF output but not duplicated
		     here — the preview is illustrative, not print-accurate. -->
		<div>
			<h3 class="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-2">
				Preview
				<span class="text-xs text-slate-500 normal-case tracking-normal font-normal">
					(first page of {pages})
				</span>
			</h3>
			<div class="label-sheet">
				{#each ids.slice(0, LABELS_PER_PAGE) as id, i}
					<div class="label-cell">
						<div class="qr">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html previewSvgs[i] ?? ''}
						</div>
						<div class="label-text">
							<div class="brand">SampleTown</div>
							<div class="id">{id}</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	/* Preview is scaled-down but proportional to the Avery 5160 sheet so
	   the user can eyeball spacing before exporting the PDF. We don't use
	   @media print here — users download the PDF and print from that. */
	.label-sheet {
		display: grid;
		grid-template-columns: repeat(3, 2.625in);
		grid-auto-rows: 1in;
		gap: 0 0.125in;
		background: white;
		padding: 0.5in 0.1875in;
		border-radius: 6px;
		width: fit-content;
	}
	.label-cell {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0.05in;
		box-sizing: border-box;
		overflow: hidden;
		color: black;
	}
	.label-cell .qr {
		width: 0.9in;
		height: 0.9in;
		flex-shrink: 0;
	}
	.label-cell .qr :global(svg) {
		width: 100% !important;
		height: 100% !important;
	}
	.label-text {
		flex: 1;
		min-width: 0;
		font-family: ui-monospace, monospace;
		line-height: 1.15;
	}
	.label-text .brand {
		font-weight: 600;
		font-size: 9px;
		color: #475569;
	}
	.label-text .id {
		font-size: 8px;
		word-break: break-all;
		letter-spacing: -0.02em;
		margin-top: 2px;
	}
</style>
