<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import { goto } from '$app/navigation';
	import { cart } from '$lib/stores/cart.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let extracts = $state(data.extracts as any[]);
	let selectedIds = $state(new Set<string>());

	function addToCart() {
		const items = extracts
			.filter((e) => selectedIds.has(e.id))
			.map((e) => ({
				type: 'extract' as const,
				id: e.id,
				label: e.extract_name,
				sublabel: e.samp_name
			}));
		cart.addMany(items);
		selectedIds = new Set();
	}

	const columns = [
		{ key: 'extract_name', label: 'Extract', sortable: true },
		{ key: 'samp_name', label: 'Sample', sortable: true },
		{ key: 'extraction_method', label: 'Method', sortable: true },
		{ key: 'concentration_ng_ul', label: 'Conc. (ng/µL)', sortable: true },
		{ key: 'extraction_date', label: 'Date', sortable: true },
		{ key: 'people_summary', label: 'People', sortable: true }
	];

	async function deleteExtract(row: Record<string, unknown>) {
		if (!confirm(`Delete extract "${row.extract_name}"?`)) return;
		await fetch(`/api/extracts/${row.id}`, { method: 'DELETE' });
		extracts = extracts.filter(e => e.id !== row.id);
	}

	async function duplicateExtract(row: Record<string, unknown>) {
		const res = await fetch(`/api/extracts/${row.id}`);
		if (!res.ok) return;
		const orig = await res.json();
		const body = { ...orig, extract_name: `${orig.extract_name}_copy`, id: undefined, created_at: undefined, updated_at: undefined };
		const created = await fetch('/api/extracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (created.ok) { const e = await created.json(); goto(`/extracts/${e.id}`); }
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-white">DNA Extracts</h1>
		<div class="flex items-center gap-2">
			{#if selectedIds.size > 0}
				<button onclick={addToCart} class="px-3 py-2 border border-ocean-700 text-ocean-400 rounded-lg hover:bg-ocean-900/30 transition-colors text-sm font-medium">
					Add {selectedIds.size} to Cart
				</button>
			{/if}
			<a href="/extracts/new" class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">New Extract</a>
		</div>
	</div>

	<DataTable
		{columns}
		bind:rows={extracts}
		bind:selectedIds
		href={(row) => `/extracts/${row.id}`}
		selectable
		empty="No extracts yet."
		showId
		filterable
		editHref={(row) => `/extracts/${row.id}/edit`}
		ondelete={deleteExtract}
		onduplicate={duplicateExtract}
	/>
</div>
