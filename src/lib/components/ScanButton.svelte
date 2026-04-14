<script lang="ts">
	import Scanner from './Scanner.svelte';

	let open = $state(false);
</script>

<!-- Mobile: floating action button in the bottom-right.
     Desktop: inline button in the navbar slot (rendered separately). -->
<button
	type="button"
	onclick={() => (open = true)}
	class="fixed bottom-4 right-4 z-40 sm:static sm:z-auto flex items-center gap-1.5 px-3 py-2 rounded-full sm:rounded-lg bg-ocean-600 text-white hover:bg-ocean-500 transition-colors shadow-lg sm:shadow-none text-sm font-medium"
	title="Scan QR code"
	aria-label="Scan QR code"
>
	<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
		<path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/>
		<path d="M7 8h3v3H7zM14 8h3v3h-3zM7 13h3v3H7zM14 13h3v3h-3z"/>
	</svg>
	<span class="hidden sm:inline">Scan</span>
</button>

<Scanner bind:open onclose={() => (open = false)} />
