<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import { goto } from '$app/navigation';
	import { cart } from '$lib/stores/cart.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let allPlates = $state(data.plates as any[]);
	let orphanReactions = $state(data.orphanReactions as any[]);
	let selectedIds = $state(new Set<string>());
	let cartFilterActive = $state(true);

	// Filter plates by carted extracts: show plates that contain any carted extract
	const cartExtractIds = $derived(cart.idsOfType('extract'));
	const hasCartFilter = $derived(cartExtractIds.size > 0);

	/** Parse comma-separated extract_ids from the server query */
	function plateHasCartedExtract(plate: any): boolean {
		if (!plate.extract_ids) return false;
		const ids = (plate.extract_ids as string).split(',');
		return ids.some((id) => cartExtractIds.has(id));
	}

	let plates = $derived(
		hasCartFilter && cartFilterActive
			? allPlates.filter(plateHasCartedExtract)
			: allPlates
	);

	function addToCart() {
		const items = plates
			.filter((p) => selectedIds.has(p.id))
			.map((p) => ({
				type: 'pcr_plate' as const,
				id: p.id,
				label: p.plate_name,
				sublabel: `${p.target_gene} · ${p.reaction_count} reactions`
			}));
		cart.addMany(items);
		cart.openSidebar();
		selectedIds = new Set();
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
		<h1 class="text-2xl font-bold text-white">PCR</h1>
		<div class="flex items-center gap-2">
			{#if selectedIds.size > 0}
				<button onclick={addToCart} class="px-3 py-2 border border-ocean-700 text-ocean-400 rounded-lg hover:bg-ocean-900/30 transition-colors text-sm font-medium">
					Add {selectedIds.size} to Cart
				</button>
			{/if}
			<a href="/pcr/new" class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">New Plate</a>
		</div>
	</div>

	<DataTable
		columns={plateColumns}
		rows={plates}
		bind:selectedIds
		bind:cartFilterActive
		href={(row) => `/pcr/${row.id}`}
		selectable
		empty="No PCR plates yet."
		showId
		filterable
		cartFilterLabel={hasCartFilter ? `showing ${plates.length}/${allPlates.length} plates` : ''}
		editHref={(row) => `/pcr/${row.id}/edit`}
		ondelete={deletePlate}
		onduplicate={duplicatePlate}
	/>

	{#if orphanReactions.length > 0}
		<div class="pt-4">
			<h2 class="text-lg font-semibold text-white mb-3">Individual Reactions (no plate)</h2>
			<DataTable columns={reactionColumns} bind:rows={orphanReactions} href={(row) => `/pcr/reaction/${row.id}`} empty="" showId />
		</div>
	{/if}
</div>
