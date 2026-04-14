<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		id: string;
		/** Size in px. Defaults to 128 — big enough to scan from a phone held
		 *  a few inches from a laptop screen. */
		size?: number;
	}

	let { id, size = 128 }: Props = $props();

	let smallSvg = $state<string>('');
	let largeSvg = $state<string>('');
	let url = $state<string>('');
	let copied = $state(false);
	let zoomed = $state(false);

	/** High-contrast color palette for QR rendering: foreground color on a
	 *  transparent background reads against the dark theme while staying
	 *  scannable. */
	const QR_COLORS = { dark: '#e2e8f0', light: '#00000000' };

	onMount(async () => {
		// Build the absolute URL the QR encodes. Using window.location.origin so
		// the QR works across dev / staging / prod without hardcoding.
		url = `${window.location.origin}/id/${id}`;
		const QRCode = (await import('qrcode')).default;
		// Render two sizes up front: the inline thumbnail and a large version
		// the lightbox will show on click.
		smallSvg = await QRCode.toString(url, { type: 'svg', margin: 1, width: size, color: QR_COLORS });
		largeSvg = await QRCode.toString(url, { type: 'svg', margin: 2, width: 384, color: QR_COLORS });
	});

	async function copyUrl() {
		try {
			await navigator.clipboard.writeText(url);
			copied = true;
			setTimeout(() => (copied = false), 1500);
		} catch { /* clipboard blocked — user can select text instead */ }
	}
</script>

<div class="inline-flex flex-col items-center gap-1">
	{#if smallSvg}
		<button
			type="button"
			onclick={() => (zoomed = true)}
			class="block cursor-zoom-in"
			title="Click to enlarge"
			aria-label="Enlarge QR code"
		>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html smallSvg}
		</button>
	{:else}
		<div style="width: {size}px; height: {size}px;" class="bg-slate-800 rounded"></div>
	{/if}
	<button
		type="button"
		onclick={copyUrl}
		class="font-mono text-[10px] text-slate-500 hover:text-ocean-400 transition-colors"
		title="Copy URL"
	>{copied ? 'copied' : id.slice(0, 8) + '…'}</button>
</div>

{#if zoomed}
	<div
		class="fixed inset-0 z-[100] bg-slate-950/95 flex items-center justify-center p-4 cursor-zoom-out"
		onclick={() => (zoomed = false)}
		onkeydown={(e) => { if (e.key === 'Escape') zoomed = false; }}
		role="dialog"
		aria-modal="true"
		aria-label="QR code"
		tabindex="-1"
	>
		<div class="flex flex-col items-center gap-3" onclick={(e) => e.stopPropagation()} role="presentation">
			<div class="rounded-lg bg-slate-950 p-4">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html largeSvg}
			</div>
			<div class="flex items-center gap-3 text-sm">
				<a href={url} class="text-ocean-400 hover:text-ocean-300 font-mono text-xs">{url}</a>
				<button
					type="button"
					onclick={(e) => { e.stopPropagation(); copyUrl(); }}
					class="text-slate-400 hover:text-white text-xs"
				>{copied ? 'copied' : 'copy'}</button>
				<button
					type="button"
					onclick={() => (zoomed = false)}
					class="text-slate-400 hover:text-white text-xs"
				>close</button>
			</div>
		</div>
	</div>
{/if}
