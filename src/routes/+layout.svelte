<script lang="ts">
	import '../app.css';
	import Navbar from '$lib/components/Navbar.svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		data: { user: import('$lib/types').User | null };
		children: Snippet;
	}

	let { data, children }: Props = $props();
</script>

<div class="min-h-screen flex flex-col">
	<Navbar user={data.user} />
	<main class="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
		{@render children()}
	</main>
	<footer class="border-t border-slate-800 py-4 text-center text-xs text-slate-600">
		SampleTown &middot; MIxS-compliant eDNA sample tracking
	</footer>
</div>
