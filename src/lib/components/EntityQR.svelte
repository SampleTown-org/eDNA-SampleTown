<script lang="ts">
	import { onMount } from 'svelte';

	interface Props {
		id: string;
		/** Size in px. Defaults to 128 — big enough to scan from a phone held
		 *  a few inches from a laptop screen. */
		size?: number;
	}

	let { id, size = 128 }: Props = $props();

	let svgHtml = $state<string>('');
	let url = $state<string>('');
	let copied = $state(false);

	onMount(async () => {
		// Build the absolute URL the QR encodes. Using window.location.origin so
		// the QR works across dev / staging / prod without hardcoding.
		url = `${window.location.origin}/id/${id}`;
		const QRCode = (await import('qrcode')).default;
		svgHtml = await QRCode.toString(url, {
			type: 'svg',
			margin: 1,
			width: size,
			color: {
				// White-on-transparent so the SVG reads on the dark theme.
				dark: '#e2e8f0',
				light: '#00000000'
			}
		});
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
	{#if svgHtml}
		<a href={url} class="block" title="Open {url}">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html svgHtml}
		</a>
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
