<script lang="ts">
	import { onMount } from 'svelte';
	import { cart } from '$lib/stores/cart.svelte';
	import { buildLabelsPdf, type LabelInput } from '$lib/labels-pdf';

	/**
	 * Avery 5160 layout: 30 labels per letter-size page (3 cols × 10 rows),
	 * 1" × 2⅝" each with a 0.125" horizontal gap and 0.5" top margin.
	 * On-screen preview here mirrors the PDF export.
	 */
	const LABELS_PER_PAGE = 30;

	/** Types the blank-label generator can pre-assign. Matches the
	 *  scanner's claim-page order (minus PCR reaction + plain library,
	 *  which only exist as children of a plate). */
	const BLANK_TYPES: { value: string; label: string }[] = [
		{ value: '', label: 'No type (pick on scan)' },
		{ value: 'project', label: 'Project' },
		{ value: 'site', label: 'Site' },
		{ value: 'sample', label: 'Sample' },
		{ value: 'extract', label: 'Extract' },
		{ value: 'pcr_plate', label: 'PCR Plate' },
		{ value: 'library_plate', label: 'Library Plate' },
		{ value: 'run', label: 'Sequencing Run' }
	];

	/** Generate a 32-char hex id matching our DB format. */
	function mintId(): string {
		const bytes = new Uint8Array(16);
		crypto.getRandomValues(bytes);
		return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
	}

	// ---- Blank-sheet state ----
	let blankPages = $state(1);
	let blankType = $state('');
	let blankIds = $state<string[]>([]);
	let blankPreviewSvgs = $state<string[]>([]);
	let origin = $state('');
	let busy = $state(false);

	const blankCount = $derived(blankPages * LABELS_PER_PAGE);

	async function generateBlank() {
		busy = true;
		try {
			const { default: QRCode } = await import('qrcode');
			const fresh = Array.from({ length: blankCount }, mintId);
			const svgs = await Promise.all(
				fresh.map((id) => {
					const target = blankType
						? `${origin}/id/${id}?t=${encodeURIComponent(blankType)}`
						: `${origin}/id/${id}`;
					return QRCode.toString(target, {
						type: 'svg',
						margin: 1,
						width: 160,
						color: { dark: '#000000', light: '#ffffff' }
					});
				})
			);
			blankIds = fresh;
			blankPreviewSvgs = svgs;
		} finally {
			busy = false;
		}
	}

	async function downloadBlankPdf() {
		if (blankIds.length === 0) return;
		busy = true;
		try {
			const labels: LabelInput[] = blankIds.map((id) => ({
				id,
				type: blankType || undefined
			}));
			const ts = new Date().toISOString().slice(0, 10);
			const suffix = blankType ? `-${blankType}` : '';
			await buildLabelsPdf(labels, origin, `sampletown-labels${suffix}-${ts}.pdf`);
		} finally {
			busy = false;
		}
	}

	function exportBlankCsv() {
		const header = 'id,type,url\n';
		const rows = blankIds
			.map((id) => {
				const url = blankType
					? `${origin}/id/${id}?t=${blankType}`
					: `${origin}/id/${id}`;
				return `${id},${blankType || ''},${url}`;
			})
			.join('\n');
		const blob = new Blob([header + rows + '\n'], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `sampletown-labels-${new Date().toISOString().slice(0, 10)}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}

	// ---- Cart-labels state ----
	let cartBusy = $state(false);

	async function downloadCartPdf() {
		if (cart.count === 0) return;
		cartBusy = true;
		try {
			const labels: LabelInput[] = cart.items.map((it) => ({
				id: it.id,
				type: it.type,
				primary: it.label,
				secondary: it.sublabel
			}));
			const ts = new Date().toISOString().slice(0, 10);
			await buildLabelsPdf(labels, origin, `sampletown-cart-${ts}.pdf`);
		} finally {
			cartBusy = false;
		}
	}

	onMount(() => {
		origin = window.location.origin;
	});
</script>

<div class="space-y-8">
	<!-- ========== Cart items ========== -->
	<section class="rounded-lg border border-slate-800 p-4 space-y-3">
		<h3 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">
			Cart items
			<span class="text-xs text-slate-500 normal-case tracking-normal font-normal">({cart.count})</span>
		</h3>
		<p class="text-sm text-slate-400">
			Print a QR sticker per item currently in the cart. Each label carries the
			item's entity name, project/site context, and type tag so a scanned tube
			lands on the right detail page.
		</p>
		<div class="flex items-center gap-3 flex-wrap">
			<button
				type="button"
				onclick={downloadCartPdf}
				disabled={cart.count === 0 || cartBusy}
				class="px-3 py-1.5 bg-ocean-600 text-white rounded hover:bg-ocean-500 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
			>{cartBusy ? 'Building PDF…' : `Download PDF (${cart.count} label${cart.count === 1 ? '' : 's'})`}</button>
			{#if cart.count === 0}
				<span class="text-xs text-slate-500">Add items to the cart on any list page to enable this.</span>
			{/if}
		</div>
	</section>

	<!-- ========== Blank pre-printed sheets ========== -->
	<section class="rounded-lg border border-slate-800 p-4 space-y-3">
		<h3 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Blank sheets</h3>
		<p class="text-sm text-slate-400">
			Generate pre-printed sticker sheets for future sampling trips. Each label
			encodes <code class="text-xs text-slate-500">{origin || 'https://…'}/id/&lt;uuid&gt;</code>;
			ids are minted client-side and don't exist in the database until a scan
			claims them. Sized for <strong>Avery 5160</strong> (US Letter, 1″ × 2⅝″, 30 per page).
		</p>

		<div class="flex items-end gap-3 flex-wrap">
			<label class="block">
				<span class="block text-xs text-slate-400 mb-1">Pre-assign type</span>
				<select
					bind:value={blankType}
					class="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500"
				>
					{#each BLANK_TYPES as opt}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</label>
			<label class="block">
				<span class="block text-xs text-slate-400 mb-1">Pages (30 labels each)</span>
				<input
					type="number"
					min="1"
					max="50"
					bind:value={blankPages}
					class="w-24 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500"
				/>
			</label>
			<div class="text-xs text-slate-500 pb-2">= {blankCount} labels</div>
			<button
				type="button"
				onclick={generateBlank}
				disabled={busy}
				class="px-3 py-1.5 bg-ocean-600 text-white rounded hover:bg-ocean-500 transition-colors text-sm font-medium disabled:opacity-50"
			>
				{busy && blankIds.length === 0 ? 'Generating…' : blankIds.length > 0 ? 'Regenerate' : 'Generate'}
			</button>
			{#if blankIds.length > 0}
				<button
					type="button"
					onclick={downloadBlankPdf}
					disabled={busy}
					class="px-3 py-1.5 bg-ocean-600 text-white rounded hover:bg-ocean-500 transition-colors text-sm font-medium disabled:opacity-50"
				>{busy ? 'Building PDF…' : 'Download PDF'}</button>
				<button
					type="button"
					onclick={exportBlankCsv}
					class="px-3 py-1.5 border border-slate-700 text-slate-400 rounded hover:bg-slate-800 transition-colors text-sm"
					title="id,type,url CSV — backup record of which codes were issued"
				>Export CSV</button>
			{/if}
		</div>
		<p class="text-xs text-slate-500">
			With a type selected, scanning a blank label skips the claim picker and
			jumps straight to that entity's new form. Zebra-printer wiring will slot
			in as another export button once the hardware arrives.
		</p>

		{#if blankIds.length > 0}
			<div>
				<h4 class="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
					Preview
					<span class="text-xs text-slate-500 normal-case tracking-normal font-normal">
						(first page of {blankPages})
					</span>
				</h4>
				<div class="label-sheet">
					{#each blankIds.slice(0, LABELS_PER_PAGE) as id, i}
						<div class="label-cell">
							<div class="qr">
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								{@html blankPreviewSvgs[i] ?? ''}
							</div>
							<div class="label-text">
								{#if blankType}
									<div class="type-tag">{blankType.replace(/_/g, ' ').toUpperCase()}</div>
								{:else}
									<div class="brand">SampleTown</div>
								{/if}
								<div class="id">{id}</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</section>
</div>

<style>
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
	.label-text .type-tag {
		font-weight: 700;
		font-size: 10px;
		color: #0369a1;
		letter-spacing: 0.04em;
		font-family: system-ui, sans-serif;
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
		color: #0f172a;
	}
</style>
