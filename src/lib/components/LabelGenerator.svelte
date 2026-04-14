<script lang="ts">
	import { onMount } from 'svelte';

	/** Generate a 32-char hex UUID matching our DB id format (crypto.randomUUID
	 *  returns dashed UUIDv4, but our ids are plain 32 hex chars — strip dashes
	 *  so a scanned QR routes through /id/<uuid> unmodified). */
	function mintId(): string {
		const bytes = new Uint8Array(16);
		crypto.getRandomValues(bytes);
		return Array.from(bytes)
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');
	}

	let count = $state(30);
	let ids = $state<string[]>([]);
	let qrMap = $state<Map<string, string>>(new Map());
	let origin = $state('');
	let generating = $state(false);

	async function generate() {
		generating = true;
		try {
			const { default: QRCode } = await import('qrcode');
			const fresh = Array.from({ length: count }, mintId);
			// Render all QR SVGs in parallel — typical sheet is 30–60 codes,
			// each SVG is a few KB. Much faster than sequential.
			const entries = await Promise.all(
				fresh.map(async (id) => {
					const svg = await QRCode.toString(`${origin}/id/${id}`, {
						type: 'svg',
						margin: 1,
						width: 220,
						color: { dark: '#000000', light: '#ffffff' }
					});
					return [id, svg] as const;
				})
			);
			qrMap = new Map(entries);
			ids = fresh;
		} finally {
			generating = false;
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
	<div class="no-print rounded-lg border border-slate-800 p-4 space-y-3">
		<p class="text-sm text-slate-300">
			Generate a sheet of QR-coded labels. Each label encodes
			<code class="text-xs text-slate-400">{origin || 'https://…'}/id/&lt;uuid&gt;</code>
			and can be applied to a physical sample, site, etc. Scan one later to claim or locate it.
		</p>

		<div class="flex items-end gap-3 flex-wrap">
			<label class="block">
				<span class="block text-xs text-slate-400 mb-1">How many</span>
				<input
					type="number"
					min="1"
					max="500"
					bind:value={count}
					class="w-24 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500"
				/>
			</label>
			<button
				type="button"
				onclick={generate}
				disabled={generating}
				class="px-3 py-1.5 bg-ocean-600 text-white rounded hover:bg-ocean-500 transition-colors text-sm font-medium disabled:opacity-50"
			>
				{generating ? 'Generating…' : ids.length > 0 ? 'Regenerate' : 'Generate'}
			</button>
			{#if ids.length > 0}
				<button
					type="button"
					onclick={() => window.print()}
					class="px-3 py-1.5 border border-slate-700 text-slate-300 rounded hover:bg-slate-800 transition-colors text-sm font-medium"
				>Print</button>
				<button
					type="button"
					onclick={exportCsv}
					class="px-3 py-1.5 border border-slate-700 text-slate-400 rounded hover:bg-slate-800 transition-colors text-sm"
					title="Download id,url CSV as a backup record of which codes were issued"
				>Export CSV</button>
			{/if}
		</div>
		<p class="text-xs text-slate-500">
			Ids are generated client-side. They're claimed the first time someone scans the QR and fills in the form — until then they don't exist in the database. Save the CSV if you want a record of which ids were printed.
		</p>
	</div>

	{#if ids.length > 0}
		<!-- Grid of label cells. Tuned roughly for Avery 5160 / 30-up sheets:
		     3 columns × 10 rows of ≈1" × 2⅝" cells. Tweak cell-size in print
		     CSS if you're using different stock. -->
		<div class="label-grid">
			{#each ids as id}
				<div class="label-cell">
					<div class="qr">
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html qrMap.get(id) ?? ''}
					</div>
					<div class="label-text">
						<div class="brand">SampleTown</div>
						<div class="id">{id}</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	/* Inline rendering: dark cards for screen preview that invert to white
	   for print. Labels laid out at roughly 1" × 2⅝" so a 3×10 grid fills
	   a standard Avery 5160 sheet; tighten/loosen these as needed. */
	.label-grid {
		display: grid;
		grid-template-columns: repeat(3, 2.625in);
		grid-auto-rows: 1in;
		gap: 0;
		justify-content: center;
		background: white;
		padding: 0.5in 0.1875in;
		border-radius: 8px;
	}
	.label-cell {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
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
		line-height: 1.1;
	}
	.label-text .brand {
		font-weight: 600;
		font-size: 10px;
		color: #64748b;
	}
	.label-text .id {
		font-size: 8.5px;
		word-break: break-all;
		letter-spacing: -0.02em;
	}

	@media print {
		:global(nav),
		:global(footer),
		:global(.no-print),
		:global([role='complementary']) {
			display: none !important;
		}
		:global(body),
		:global(main),
		:global(.min-h-screen) {
			background: white !important;
			padding: 0 !important;
			margin: 0 !important;
			max-width: none !important;
		}
		.label-grid {
			padding: 0;
			border-radius: 0;
		}
		.label-cell {
			page-break-inside: avoid;
		}
	}
</style>
