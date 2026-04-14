<script lang="ts">
	import '../app.css';
	import Navbar from '$lib/components/Navbar.svelte';
	import CartSidebar from '$lib/components/CartSidebar.svelte';
	import FeedbackForm from '$lib/components/FeedbackForm.svelte';
	import ScanButton from '$lib/components/ScanButton.svelte';
	import { cart } from '$lib/stores/cart.svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		data: { user: import('$lib/types').User | null };
		children: Snippet;
	}

	let { data, children }: Props = $props();
</script>

<div class="min-h-screen flex flex-col" class:role-viewer={data.user?.role === 'viewer'}>
	<Navbar user={data.user} />
	<div class="flex flex-1">
		<main class="flex-1 min-w-0 max-w-7xl mx-auto w-full px-4 py-6">
			{@render children()}
		</main>
		{#if cart.sidebarOpen}
			<CartSidebar />
		{/if}
	</div>
	{#if data.user}
		<ScanButton />
	{/if}
	<FeedbackForm />
	<footer class="py-4 text-center text-xs text-slate-600">
		SampleTown &middot; MIxS-compliant eDNA sample tracking
	</footer>
</div>

<style>
	/* Read-only viewers don't see any mutation affordances in the UI.
	   Mutation buttons are tagged with `write-only` (via sed across the
	   mobile-browse pass) and the DataTable action column also opts in.
	   Back-end hooks already 403 their API writes; this matches the UI. */
	:global(.role-viewer .write-only) {
		display: none !important;
	}
</style>
