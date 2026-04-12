<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import { cart } from '$lib/stores/cart.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let runs = $state(data.runs as any[]);
	let selectedIds = $state(new Set<string>());

	function addToCart() {
		const items = runs
			.filter((r) => selectedIds.has(r.id))
			.map((r) => ({
				type: 'run' as const,
				id: r.id,
				label: r.run_name,
				sublabel: r.platform
			}));
		cart.addMany(items);
		selectedIds = new Set();
	}

	const columns = [
		{ key: 'run_name', label: 'Run', sortable: true },
		{ key: 'platform', label: 'Platform', sortable: true },
		{ key: 'instrument_model', label: 'Instrument', sortable: true },
		{ key: 'total_reads', label: 'Reads', sortable: true },
		{ key: 'run_date', label: 'Date', sortable: true },
		{ key: 'people_summary', label: 'People', sortable: true }
	];

	async function deleteRun(row: Record<string, unknown>) {
		if (!confirm(`Delete run "${row.run_name}"?`)) return;
		await fetch(`/api/runs/${row.id}`, { method: 'DELETE' });
		runs = runs.filter(r => r.id !== row.id);
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-white">Sequencing Runs</h1>
		<div class="flex items-center gap-2">
			{#if selectedIds.size > 0}
				<button onclick={addToCart} class="px-3 py-2 border border-ocean-700 text-ocean-400 rounded-lg hover:bg-ocean-900/30 transition-colors text-sm font-medium">
					Add {selectedIds.size} to Cart
				</button>
			{/if}
			<a href="/runs/new" class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">New Run</a>
		</div>
	</div>
	<DataTable
		{columns}
		bind:rows={runs}
		bind:selectedIds
		href={(row) => `/runs/${row.id}`}
		selectable
		empty="No sequencing runs yet."
		showId
		filterable
		editHref={(row) => `/runs/${row.id}/edit`}
		ondelete={deleteRun}
	/>
</div>
