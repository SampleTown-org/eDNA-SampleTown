<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import { goto } from '$app/navigation';
	import { cart, type CartEntityType } from '$lib/stores/cart.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let allPlates = $state(data.plates as any[]);
	let orphanReactions = $state(data.orphanReactions as any[]);

	// Initialize selection from what's already carted
	let selectedIds = $state(new Set(cart.getByType('pcr_plate').map((i) => i.id)));

	// Parent filter: carted extracts narrow which plates are visible (togglable)
	const cartExtractIds = $derived(cart.idsOfType('extract'));
	const hasParentFilter = $derived(cartExtractIds.size > 0);
	let parentFilterActive = $state(true);

	function plateHasCartedExtract(plate: any): boolean {
		if (!plate.extract_ids) return false;
		const ids = (plate.extract_ids as string).split(',');
		return ids.some((id) => cartExtractIds.has(id));
	}

	let plates = $derived.by(() => {
		if (!hasParentFilter || !parentFilterActive) return allPlates;
		return allPlates.filter(plateHasCartedExtract);
	});

	// Detect when selection has diverged from the cart
	const selectionChanged = $derived.by(() => {
		const carted = cart.idsOfType('pcr_plate');
		if (selectedIds.size !== carted.size) return true;
		for (const id of selectedIds) if (!carted.has(id)) return true;
		return false;
	});

	function updateCart() {
		cart.clearType('pcr_plate');
		const items = allPlates
			.filter((p) => selectedIds.has(p.id))
			.map((p) => ({
				type: 'pcr_plate' as const,
				id: p.id,
				label: p.plate_name,
				sublabel: `${p.target_gene} · ${p.reaction_count} reactions`
			}));
		if (items.length > 0) cart.addMany(items);
		cart.openSidebar();
	}

	const plateColumns = [
		{ key: 'plate_name', label: 'Plate', sortable: true },
		{ key: 'target_gene', label: 'Target', sortable: true },
		{ key: 'target_subfragment', label: 'Region', sortable: true },
		{ key: 'forward_primer_name', label: 'Fwd Primer', sortable: true },
		{ key: 'reaction_count', label: 'Reactions', sortable: true },
		{ key: 'pcr_date', label: 'Date', sortable: true },
		{ key: 'people_summary', label: 'People', sortable: true }
	];

	const reactionColumns = [
		{ key: 'pcr_name', label: 'PCR', sortable: true },
		{ key: 'extract_name', label: 'Extract', sortable: true },
		{ key: 'target_gene', label: 'Target', sortable: true },
		{ key: 'pcr_date', label: 'Date', sortable: true }
	];

	async function deletePlate(row: Record<string, unknown>) {
		if (!confirm(`Delete PCR plate "${row.plate_name}"?`)) return;
		await fetch(`/api/pcr-plates/${row.id}`, { method: 'DELETE' });
		allPlates = allPlates.filter(p => p.id !== row.id);
	}
	async function bulkDeletePlates(rs: Record<string, unknown>[]) {
		if (!confirm(`Delete ${rs.length} PCR plates?`)) return;
		const ids = rs.map((r) => r.id as string);
		await Promise.all(ids.map((id) => fetch(`/api/pcr-plates/${id}`, { method: 'DELETE' })));
		const removed = new Set(ids);
		allPlates = allPlates.filter((p) => !removed.has(p.id));
		selectedIds = new Set([...selectedIds].filter((id) => !removed.has(id)));
	}

	async function duplicatePlate(row: Record<string, unknown>) {
		const res = await fetch(`/api/pcr-plates/${row.id}`);
		if (!res.ok) return;
		const orig = await res.json();
		// Get reactions for this plate
		const reactionsRes = await fetch(`/api/pcr?plate_id=${row.id}`);
		const reactions = reactionsRes.ok ? await reactionsRes.json() : [];
		const body = {
			...orig, plate_name: `${orig.plate_name} (copy)`,
			reactions: reactions.map((r: any) => ({ extract_id: r.extract_id, pcr_name: `${r.pcr_name}_copy` })),
			id: undefined, created_at: undefined, updated_at: undefined
		};
		const created = await fetch('/api/pcr-plates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (created.ok) { const p = await created.json(); goto(`/pcr/${p.id}`); }
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-white">{data.lab?.name ? data.lab.name + " " : ""}PCR</h1>
		<div class="flex items-center gap-2">
			{#if selectionChanged}
				<button onclick={updateCart} class="hidden sm:inline-flex write-only px-3 py-2 border border-ocean-700 text-ocean-400 rounded-lg hover:bg-ocean-900/30 transition-colors text-sm font-medium">
					Update Cart ({selectedIds.size})
				</button>
			{/if}
			<a href="/pcr/new" class="hidden sm:inline-flex write-only px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">New Plate</a>
		</div>
	</div>

	<DataTable
		columns={plateColumns}
		rows={plates}
		bind:selectedIds
		bind:cartFilterActive={parentFilterActive}
		href={(row) => `/pcr/${row.id}`}
		selectable
		empty="No PCR plates yet."
		showId
		filterable
		cartFilterLabel={hasParentFilter ? `showing ${plates.length}/${allPlates.length} plates` : ''}
		editHref={(row) => `/pcr/${row.id}/edit`}
		ondelete={deletePlate}
		onduplicate={duplicatePlate}
		onbulkdelete={bulkDeletePlates}
	/>

	{#if orphanReactions.length > 0}
		<div class="pt-4">
			<h2 class="text-lg font-semibold text-white mb-3">Individual Reactions (no plate)</h2>
			<DataTable columns={reactionColumns} bind:rows={orphanReactions} href={(row) => `/pcr/reaction/${row.id}`} empty="" showId />
		</div>
	{/if}
</div>
