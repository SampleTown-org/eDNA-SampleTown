<script lang="ts">
	import { onMount } from 'svelte';
	import { cart } from '$lib/stores/cart.svelte';
	import { buildLabelsPdf, type LabelInput } from '$lib/labels-pdf';
	import { buildLabelsZpl, DEFAULT_ZEBRA_CONFIG, type ZebraConfig } from '$lib/labels-zpl';
	import {
		isAvailable as zebraIsAvailable,
		getDefaultPrinter,
		printZpl,
		DEFAULT_BASE_URL as ZEBRA_DEFAULT_BASE_URL,
		type ZebraDevice
	} from '$lib/zebra-browser-print';

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
	/** One "set" = 30 fresh unique ids (a full Avery 5160 page of distinct
	 *  uuids). Copies-each is the multiplicity: each uuid prints that many
	 *  times, and duplicates are emitted adjacent so peel-off comes in
	 *  contiguous groups. */
	let blankSets = $state(1);
	let blankCopies = $state(1);
	let blankType = $state('');
	let blankIds = $state<string[]>([]);
	let blankPreviewSvgs = $state<string[]>([]);
	let origin = $state('');
	let busy = $state(false);

	const blankUnique = $derived(blankSets * LABELS_PER_PAGE);
	const blankTotal = $derived(blankUnique * blankCopies);
	const blankPages = $derived(Math.max(1, Math.ceil(blankTotal / LABELS_PER_PAGE)));

	async function generateBlank() {
		busy = true;
		try {
			const { default: QRCode } = await import('qrcode');
			const fresh = Array.from({ length: blankUnique }, mintId);
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

	/** Repeat each id `copies` times in place, so duplicates of the same
	 *  label sit next to each other on the sheet (keeps related stickers
	 *  adjacent when peeling off a strip). */
	function expandWithCopies<T>(items: T[], copies: number): T[] {
		const out: T[] = [];
		for (const item of items) {
			for (let c = 0; c < copies; c++) out.push(item);
		}
		return out;
	}

	async function downloadBlankPdf() {
		if (blankIds.length === 0) return;
		busy = true;
		try {
			const suffix = blankType ? `-${blankType}` : '';
			await buildLabelsPdf(blankLabels(), origin, `sampletown-labels${suffix}-${ts()}.pdf`);
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
	let cartCopies = $state(1);
	let cartBusy = $state(false);

	const cartTotal = $derived(cart.count * cartCopies);

	async function downloadCartPdf() {
		if (cart.count === 0) return;
		cartBusy = true;
		try {
			await buildLabelsPdf(cartLabels(), origin, `sampletown-cart-${ts()}.pdf`);
		} finally {
			cartBusy = false;
		}
	}

	// ---- Shared label-array builders (used by both PDF and Zebra paths) ----
	function blankLabels(): LabelInput[] {
		const base: LabelInput[] = blankIds.map((id) => ({ id, type: blankType || undefined }));
		return expandWithCopies(base, blankCopies);
	}
	function cartLabels(): LabelInput[] {
		const base: LabelInput[] = cart.items.map((it) => ({
			id: it.id,
			type: it.type,
			primary: it.label,
			secondary: it.sublabel
		}));
		return expandWithCopies(base, cartCopies);
	}

	// ---- Zebra direct-print state ----
	/** Printer + ZPL settings persist per-browser (localStorage), like the
	 *  cart: which printer/media is loaded is a property of *this* bench, not
	 *  the lab, so it doesn't belong in the shared DB. */
	const ZEBRA_KEY = 'sampletown-zebra';
	type ZebraStatus = 'unknown' | 'checking' | 'ready' | 'unavailable';

	let zebraConfig = $state<ZebraConfig>({ ...DEFAULT_ZEBRA_CONFIG });
	let zebraBaseUrl = $state(ZEBRA_DEFAULT_BASE_URL);
	let zebraStatus = $state<ZebraStatus>('unknown');
	let zebraPrinter = $state<ZebraDevice | null>(null);
	let zebraError = $state('');
	/** Which section the current zebraError belongs to, so the message
	 *  renders next to the button that was actually clicked. */
	let zebraErrorAt = $state<'panel' | 'cart' | 'blank'>('panel');
	let zebraBusy = $state(false);

	/** Server-attached printer (this deployment), detected via the API. Null
	 *  until probed; { available:false } when no ZEBRA_PRINTER is configured. */
	let serverPrinter = $state<{ available: boolean; queue: string | null } | null>(null);
	/** Which backend the "Print to Zebra" buttons drive. */
	let printBackend = $state<'client' | 'server'>('client');

	const canPrintZebra = $derived(
		printBackend === 'server'
			? !!serverPrinter?.available
			: zebraStatus === 'ready' && !!zebraPrinter
	);

	function persistZebra() {
		if (typeof window === 'undefined') return;
		localStorage.setItem(
			ZEBRA_KEY,
			JSON.stringify({ config: zebraConfig, baseUrl: zebraBaseUrl })
		);
	}

	/** Probe the local Browser Print agent and remember the default printer. */
	async function checkZebra() {
		zebraStatus = 'checking';
		zebraError = '';
		try {
			if (!(await zebraIsAvailable(zebraBaseUrl))) {
				zebraStatus = 'unavailable';
				zebraPrinter = null;
				return;
			}
			zebraPrinter = await getDefaultPrinter(zebraBaseUrl);
			zebraStatus = 'ready';
		} catch (e) {
			zebraStatus = 'unavailable';
			zebraError = e instanceof Error ? e.message : String(e);
			zebraErrorAt = 'panel';
		}
	}

	/** Probe whether this deployment has a host-attached printer configured. */
	async function checkServerPrinter() {
		try {
			const res = await fetch('/api/labels/print');
			if (!res.ok) return;
			const data = await res.json();
			serverPrinter = { available: !!data.available, queue: data.queue ?? null };
			// Host-attached is the configured intent, so default to it when present.
			if (serverPrinter.available) printBackend = 'server';
		} catch {
			/* leave serverPrinter null — UI treats it as unavailable */
		}
	}

	async function sendToZebra(labels: LabelInput[], source: 'cart' | 'blank') {
		if (labels.length === 0) return;
		zebraBusy = true;
		zebraError = '';
		zebraErrorAt = source;
		try {
			if (printBackend === 'server') {
				const res = await fetch('/api/labels/print', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ labels, config: zebraConfig, origin })
				});
				if (!res.ok) {
					const body = await res.json().catch(() => null);
					throw new Error(body?.error || `Server printer error (${res.status})`);
				}
			} else {
				if (!zebraPrinter) {
					zebraError = 'No printer selected. Click "Re-check" once Browser Print is running.';
					return;
				}
				const zpl = buildLabelsZpl(labels, origin, zebraConfig);
				await printZpl(zebraPrinter, zpl, zebraBaseUrl);
			}
		} catch (e) {
			zebraError = e instanceof Error ? e.message : String(e);
		} finally {
			zebraBusy = false;
		}
	}

	/** Offline fallback: download the ZPL so it can be dropped onto the
	 *  printer's USB storage or previewed at labelary.com without a ribbon. */
	function downloadZpl(labels: LabelInput[], filename: string) {
		if (labels.length === 0) return;
		const zpl = buildLabelsZpl(labels, origin, zebraConfig);
		const blob = new Blob([zpl], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = filename;
		a.click();
		URL.revokeObjectURL(url);
	}

	const ts = () => new Date().toISOString().slice(0, 10);
	const printCartZebra = () => sendToZebra(cartLabels(), 'cart');
	const printBlankZebra = () => sendToZebra(blankLabels(), 'blank');
	const downloadCartZpl = () => downloadZpl(cartLabels(), `sampletown-cart-${ts()}.zpl`);
	const downloadBlankZpl = () =>
		downloadZpl(blankLabels(), `sampletown-labels${blankType ? `-${blankType}` : ''}-${ts()}.zpl`);

	onMount(() => {
		origin = window.location.origin;
		try {
			const saved = JSON.parse(localStorage.getItem(ZEBRA_KEY) || '{}');
			if (saved.config) zebraConfig = { ...DEFAULT_ZEBRA_CONFIG, ...saved.config };
			if (saved.baseUrl) zebraBaseUrl = saved.baseUrl;
		} catch {
			/* ignore malformed saved config */
		}
		checkZebra();
		checkServerPrinter();
	});
</script>

<div class="space-y-8">
	<!-- ========== Zebra ZD421 direct printer ========== -->
	<section class="rounded-lg border border-slate-800 p-4 space-y-3">
		<div class="flex items-center justify-between gap-3 flex-wrap">
			<h3 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">
				Zebra label printer
			</h3>
			<div class="flex items-center gap-2 text-xs">
				{#if printBackend === 'server'}
					{#if serverPrinter?.available}
						<span class="inline-flex items-center gap-1.5 text-emerald-400">
							<span class="w-2 h-2 rounded-full bg-emerald-500"></span>
							Server queue: {serverPrinter.queue ?? 'configured'}
						</span>
					{:else}
						<span class="inline-flex items-center gap-1.5 text-slate-500">
							<span class="w-2 h-2 rounded-full bg-slate-600"></span>
							No server printer on this deployment
						</span>
					{/if}
				{:else if zebraStatus === 'ready' && zebraPrinter}
					<span class="inline-flex items-center gap-1.5 text-emerald-400">
						<span class="w-2 h-2 rounded-full bg-emerald-500"></span>
						{zebraPrinter.name}
					</span>
				{:else if zebraStatus === 'ready'}
					<span class="inline-flex items-center gap-1.5 text-amber-400">
						<span class="w-2 h-2 rounded-full bg-amber-500"></span>
						Agent running, no default printer set
					</span>
				{:else if zebraStatus === 'checking'}
					<span class="text-slate-400">Checking…</span>
				{:else if zebraStatus === 'unavailable'}
					<span class="inline-flex items-center gap-1.5 text-slate-500">
						<span class="w-2 h-2 rounded-full bg-slate-600"></span>
						Browser Print not detected
					</span>
				{/if}
				{#if printBackend === 'client'}
					<button
						type="button"
						onclick={checkZebra}
						disabled={zebraStatus === 'checking'}
						class="px-2 py-1 border border-slate-700 text-slate-400 rounded hover:bg-slate-800 transition-colors disabled:opacity-50"
					>Re-check</button>
				{/if}
			</div>
		</div>

		<!-- Backend selector: host-attached (server) vs this computer (Browser Print) -->
		<div class="flex items-center gap-2 flex-wrap text-xs">
			<span class="text-slate-400">Print via:</span>
			<div class="inline-flex rounded border border-slate-700 overflow-hidden">
				<button
					type="button"
					onclick={() => (printBackend = 'server')}
					disabled={!serverPrinter?.available}
					class="px-3 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed {printBackend === 'server' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:bg-slate-800'}"
					title={serverPrinter?.available ? 'Printer attached to the SampleTown server' : 'No printer configured on the server (set ZEBRA_PRINTER)'}
				>Server printer</button>
				<button
					type="button"
					onclick={() => (printBackend = 'client')}
					class="px-3 py-1 border-l border-slate-700 transition-colors {printBackend === 'client' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:bg-slate-800'}"
					title="Zebra plugged into this computer via USB (Browser Print)"
				>This computer</button>
			</div>
		</div>

		<p class="text-sm text-slate-400">
			Print QR labels straight to a Zebra desktop printer (ZD421 etc.) — the QR is
			rendered natively by the printer, so it's crisp at any size.
			<strong>Server printer</strong> prints from a Zebra attached to the SampleTown
			host; <strong>This computer</strong> prints from a Zebra plugged into your own
			machine via Zebra's
			<a
				href="https://www.zebra.com/us/en/support-downloads/printer-software/browser-print.html"
				target="_blank"
				rel="noopener noreferrer"
				class="text-ocean-400 hover:text-ocean-300 underline">Browser Print</a
			>
			agent. No ribbon? Use <strong>Save .zpl</strong> below and preview it at
			<a
				href="https://labelary.com/viewer.html"
				target="_blank"
				rel="noopener noreferrer"
				class="text-ocean-400 hover:text-ocean-300 underline">labelary.com</a
			>.
		</p>

		{#if printBackend === 'client' && zebraStatus === 'unavailable'}
			<p class="text-xs text-amber-400/90 bg-amber-950/30 border border-amber-900/40 rounded px-3 py-2">
				Browser Print agent not reachable at <code>{zebraBaseUrl}</code>. Install
				and launch it, then click Re-check. On Firefox/Safari, set the endpoint to
				<code>https://127.0.0.1:9101</code> (Chrome/Edge work over http loopback).
				No Linux build exists — on a Linux bench, use <strong>Server printer</strong> instead.
			</p>
		{/if}
		{#if printBackend === 'server' && serverPrinter && !serverPrinter.available}
			<p class="text-xs text-amber-400/90 bg-amber-950/30 border border-amber-900/40 rounded px-3 py-2">
				No server-side printer is configured on this deployment. An admin sets
				<code>ZEBRA_PRINTER</code> in the server <code>.env</code> (see
				<code>scripts/setup-zebra.mjs</code>).
			</p>
		{/if}
		{#if zebraError && zebraErrorAt === 'panel'}
			<p class="text-xs text-rose-400 bg-rose-950/30 border border-rose-900/40 rounded px-3 py-2">{zebraError}</p>
		{/if}

		<!-- Label/ZPL settings — persist per browser -->
		<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
			<label class="block">
				<span class="block text-xs text-slate-400 mb-1">Width (in)</span>
				<input type="number" min="0.5" max="4" step="0.05" bind:value={zebraConfig.widthIn} onchange={persistZebra}
					class="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500" />
			</label>
			<label class="block">
				<span class="block text-xs text-slate-400 mb-1">Height (in)</span>
				<input type="number" min="0.25" max="6" step="0.05" bind:value={zebraConfig.heightIn} onchange={persistZebra}
					class="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500" />
			</label>
			<label class="block">
				<span class="block text-xs text-slate-400 mb-1">Resolution</span>
				<select bind:value={zebraConfig.dpi} onchange={persistZebra}
					class="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500">
					<option value={203}>203 dpi</option>
					<option value={300}>300 dpi</option>
				</select>
			</label>
			<label class="block">
				<span class="block text-xs text-slate-400 mb-1">QR error-correct</span>
				<select bind:value={zebraConfig.ecLevel} onchange={persistZebra}
					class="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500">
					<option value="L">L · ~7%</option>
					<option value="M">M · ~15%</option>
					<option value="Q">Q · ~25%</option>
					<option value="H">H · ~30%</option>
				</select>
			</label>
			<label class="block">
				<span class="block text-xs text-slate-400 mb-1">Darkness (0–30)</span>
				<input type="number" min="0" max="30" step="1" bind:value={zebraConfig.darkness} onchange={persistZebra}
					class="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500" />
			</label>
			<label class="block">
				<span class="block text-xs text-slate-400 mb-1">Speed (in/s)</span>
				<input type="number" min="1" max="6" step="1" bind:value={zebraConfig.speedIps} onchange={persistZebra}
					class="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500" />
			</label>
			<label class="block">
				<span class="block text-xs text-slate-400 mb-1">QR size</span>
				<select bind:value={zebraConfig.magnification} onchange={persistZebra}
					class="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500">
					<option value={0}>Auto (fit label)</option>
					{#each [1, 2, 3, 4, 5, 6, 7, 8] as m}
						<option value={m}>×{m}</option>
					{/each}
				</select>
			</label>
			<label class="block">
				<span class="block text-xs text-slate-400 mb-1">Agent URL</span>
				<input type="text" bind:value={zebraBaseUrl} onchange={() => { persistZebra(); checkZebra(); }}
					class="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-xs font-mono focus:outline-none focus:border-ocean-500" />
			</label>
		</div>
		<p class="text-xs text-slate-500">
			Settings are saved in this browser. "Print to Zebra" buttons below light up
			once a printer is detected.
		</p>
	</section>

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
		<div class="flex items-end gap-3 flex-wrap">
			<label class="block">
				<span class="block text-xs text-slate-400 mb-1">Copies per item</span>
				<input
					type="number"
					min="1"
					max="50"
					bind:value={cartCopies}
					class="w-20 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500"
				/>
			</label>
			<div class="text-xs text-slate-500 pb-2">= {cartTotal} label{cartTotal === 1 ? '' : 's'}</div>
			<button
				type="button"
				onclick={downloadCartPdf}
				disabled={cart.count === 0 || cartBusy}
				class="px-3 py-1.5 bg-ocean-600 text-white rounded hover:bg-ocean-500 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
			>{cartBusy ? 'Building PDF…' : 'Download PDF'}</button>
			<button
				type="button"
				onclick={printCartZebra}
				disabled={cart.count === 0 || zebraBusy || !canPrintZebra}
				title={canPrintZebra ? 'Send to the selected Zebra printer' : 'No Zebra printer ready — see the Zebra panel above'}
				class="px-3 py-1.5 bg-emerald-700 text-white rounded hover:bg-emerald-600 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
			>{zebraBusy ? 'Printing…' : 'Print to Zebra'}</button>
			<button
				type="button"
				onclick={downloadCartZpl}
				disabled={cart.count === 0}
				class="px-3 py-1.5 border border-slate-700 text-slate-400 rounded hover:bg-slate-800 transition-colors text-sm disabled:opacity-40 disabled:cursor-not-allowed"
				title="Download raw ZPL — drop onto the printer's USB storage or preview at labelary.com"
			>Save .zpl</button>
			{#if cart.count === 0}
				<span class="text-xs text-slate-500">Add items to the cart on any list page to enable this.</span>
			{/if}
		</div>
		{#if zebraError && zebraErrorAt === 'cart'}
			<p class="text-xs text-rose-400 bg-rose-950/30 border border-rose-900/40 rounded px-3 py-2">{zebraError}</p>
		{/if}
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
				<span class="block text-xs text-slate-400 mb-1">Sets (30 ids each)</span>
				<input
					type="number"
					min="1"
					max="50"
					bind:value={blankSets}
					class="w-24 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500"
				/>
			</label>
			<label class="block">
				<span class="block text-xs text-slate-400 mb-1">Copies each</span>
				<input
					type="number"
					min="1"
					max="50"
					bind:value={blankCopies}
					class="w-20 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500"
				/>
			</label>
			<div class="text-xs text-slate-500 pb-2">
				= {blankTotal} label{blankTotal === 1 ? '' : 's'} · {blankPages} page{blankPages === 1 ? '' : 's'}
			</div>
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
					onclick={printBlankZebra}
					disabled={zebraBusy || !canPrintZebra}
					title={canPrintZebra ? 'Send to the selected Zebra printer' : 'No Zebra printer ready — see the Zebra panel above'}
					class="px-3 py-1.5 bg-emerald-700 text-white rounded hover:bg-emerald-600 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
				>{zebraBusy ? 'Printing…' : 'Print to Zebra'}</button>
				<button
					type="button"
					onclick={downloadBlankZpl}
					class="px-3 py-1.5 border border-slate-700 text-slate-400 rounded hover:bg-slate-800 transition-colors text-sm"
					title="Download raw ZPL — drop onto the printer's USB storage or preview at labelary.com"
				>Save .zpl</button>
				<button
					type="button"
					onclick={exportBlankCsv}
					class="px-3 py-1.5 border border-slate-700 text-slate-400 rounded hover:bg-slate-800 transition-colors text-sm"
					title="id,type,url CSV — backup record of which codes were issued"
				>Export CSV</button>
			{/if}
		</div>
		{#if zebraError && zebraErrorAt === 'blank'}
			<p class="text-xs text-rose-400 bg-rose-950/30 border border-rose-900/40 rounded px-3 py-2">{zebraError}</p>
		{/if}
		<p class="text-xs text-slate-500">
			With a type selected, scanning a blank label skips the claim picker and
			jumps straight to that entity's new form.
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
					{#each expandWithCopies(blankIds.map((id, i) => ({ id, i })), blankCopies).slice(0, LABELS_PER_PAGE) as cell}
						<div class="label-cell">
							<div class="qr">
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								{@html blankPreviewSvgs[cell.i] ?? ''}
							</div>
							<div class="label-text">
								{#if blankType}
									<div class="type-tag">{blankType.replace(/_/g, ' ').toUpperCase()}</div>
								{:else}
									<div class="brand">SampleTown</div>
								{/if}
								<div class="id">{cell.id.slice(0, 8)}</div>
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
		align-items: flex-start;
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
		/* Cap the text column width so there's visible blank space on the
		   right of each label for pen annotations. */
		max-width: 1in;
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
		font-family: system-ui, sans-serif;
	}
	.label-text .id {
		font-size: 7px;
		word-break: break-all;
		letter-spacing: -0.02em;
		margin-top: 2px;
		color: #0f172a;
	}
</style>
