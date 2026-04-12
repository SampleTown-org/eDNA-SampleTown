<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import { goto } from '$app/navigation';
	import { cart, type CartEntityType } from '$lib/stores/cart.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let allSamples = $state(data.samples as any[]);

	// Initialize selection from what's already carted
	let selectedIds = $state(new Set(cart.getByType('sample').map((i) => i.id)));

	// Parent filter: carted projects/sites narrow what's visible (togglable via funnel)
	const cartProjectIds = $derived(cart.idsOfType('project'));
	const cartSiteIds = $derived(cart.idsOfType('site'));
	const hasParentFilter = $derived(cartProjectIds.size > 0 || cartSiteIds.size > 0);
	let parentFilterActive = $state(true);

	let samples = $derived.by(() => {
		if (!hasParentFilter || !parentFilterActive) return allSamples;
		return allSamples.filter((s: any) =>
			(cartProjectIds.size === 0 || cartProjectIds.has(s.project_id)) &&
			(cartSiteIds.size === 0 || cartSiteIds.has(s.site_id))
		);
	});

	// Detect when selection has diverged from the cart
	const selectionChanged = $derived.by(() => {
		const carted = cart.idsOfType('sample');
		if (selectedIds.size !== carted.size) return true;
		for (const id of selectedIds) if (!carted.has(id)) return true;
		return false;
	});

	function updateCart() {
		// Remove all samples from cart, then re-add the selected ones
		cart.clearType('sample');
		const items = allSamples
			.filter((s) => selectedIds.has(s.id))
			.map((s) => ({
				type: 'sample' as const,
				id: s.id,
				label: s.samp_name,
				sublabel: s.project_name
			}));
		if (items.length > 0) cart.addMany(items);
		cart.openSidebar();
	}

	const columns = [
		{ key: 'samp_name', label: 'Sample', sortable: true },
		{ key: 'project_name', label: 'Project', sortable: true },
		{ key: 'site_name', label: 'Site', sortable: true },
		{ key: 'mixs_checklist', label: 'Checklist', sortable: true },
		{ key: 'geo_loc_name', label: 'Location', sortable: true },
		{ key: 'collection_date', label: 'Collected', sortable: true },
		{ key: 'people_summary', label: 'People', sortable: true }
	];

	async function deleteSample(row: Record<string, unknown>) {
		if (!confirm(`Delete sample "${row.samp_name}"?`)) return;
		await fetch(`/api/samples/${row.id}`, { method: 'DELETE' });
		allSamples = allSamples.filter(s => s.id !== row.id);
	}

	async function duplicateSample(row: Record<string, unknown>) {
		const res = await fetch(`/api/samples/${row.id}`);
		if (!res.ok) return;
		const orig = await res.json();
		const body = { ...orig, samp_name: `${orig.samp_name}_copy`, id: undefined, created_at: undefined, updated_at: undefined };
		const created = await fetch('/api/samples', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (created.ok) { const s = await created.json(); goto(`/samples/${s.id}`); }
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-white">Samples</h1>
		<div class="flex items-center gap-2">
			{#if selectionChanged}
				<button onclick={updateCart} class="px-3 py-2 border border-ocean-700 text-ocean-400 rounded-lg hover:bg-ocean-900/30 transition-colors text-sm font-medium">
					Update Cart ({selectedIds.size})
				</button>
			{/if}
			<a href="/samples/new" class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">New Sample</a>
		</div>
	</div>

	<DataTable
		{columns}
		rows={samples}
		bind:selectedIds
		href={(row) => `/samples/${row.id}`}
		empty="No samples yet."
		showId
		filterable
		selectable
		cartFilterLabel={hasParentFilter ? `showing ${samples.length}/${allSamples.length} samples` : ''}
		bind:cartFilterActive={parentFilterActive}
		editHref={(row) => `/samples/${row.id}/edit`}
		ondelete={deleteSample}
		onduplicate={duplicateSample}
	/>
</div>
