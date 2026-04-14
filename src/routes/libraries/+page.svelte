<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import { goto } from '$app/navigation';
	import { cart, type CartEntityType } from '$lib/stores/cart.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let allPlates = $state(data.plates as any[]);
	let orphanLibraries = $state(data.orphanLibraries as any[]);

	// Initialize selection from what's already carted
	let selectedIds = $state(new Set(cart.getByType('library_plate').map((i) => i.id)));

	// Parent filter: carted pcr plates/extracts narrow what's visible (togglable)
	const cartExtractIds = $derived(cart.idsOfType('extract'));
	const cartPcrIds = $derived(cart.idsOfType('pcr'));
	const cartPcrPlateIds = $derived(cart.idsOfType('pcr_plate'));
	const hasParentFilter = $derived(
		cartExtractIds.size > 0 || cartPcrIds.size > 0 || cartPcrPlateIds.size > 0
	);
	let parentFilterActive = $state(true);

	function plateMatchesCart(plate: any): boolean {
		if (cartPcrPlateIds.size > 0 && plate.pcr_plate_id && cartPcrPlateIds.has(plate.pcr_plate_id)) return true;
		if (cartPcrIds.size > 0 && plate.pcr_ids) {
			const ids = (plate.pcr_ids as string).split(',');
			if (ids.some((id) => cartPcrIds.has(id))) return true;
		}
		if (cartExtractIds.size > 0 && plate.extract_ids) {
			const ids = (plate.extract_ids as string).split(',');
			if (ids.some((id) => cartExtractIds.has(id))) return true;
		}
		return false;
	}

	let plates = $derived.by(() => {
		if (!hasParentFilter || !parentFilterActive) return allPlates;
		return allPlates.filter(plateMatchesCart);
	});

	// Detect when selection has diverged from the cart
	const selectionChanged = $derived.by(() => {
		const carted = cart.idsOfType('library_plate');
		if (selectedIds.size !== carted.size) return true;
		for (const id of selectedIds) if (!carted.has(id)) return true;
		return false;
	});

	function updateCart() {
		cart.clearType('library_plate');
		const items = allPlates
			.filter((p) => selectedIds.has(p.id))
			.map((p) => ({
				type: 'library_plate' as const,
				id: p.id,
				label: p.plate_name,
				sublabel: `${p.library_type} · ${p.library_count} libraries`
			}));
		if (items.length > 0) cart.addMany(items);
		cart.openSidebar();
	}

	const plateColumns = [
		{ key: 'plate_name', label: 'Plate', sortable: true },
		{ key: 'library_type', label: 'Type', sortable: true },
		{ key: 'platform', label: 'Platform', sortable: true },
		{ key: 'pcr_plate_name', label: 'PCR Plate', sortable: true },
		{ key: 'library_count', label: 'Libraries', sortable: true },
		{ key: 'library_prep_date', label: 'Date', sortable: true },
		{ key: 'people_summary', label: 'People', sortable: true }
	];

	const libColumns = [
		{ key: 'library_name', label: 'Library', sortable: true },
		{ key: 'library_type', label: 'Type', sortable: true },
		{ key: 'platform', label: 'Platform', sortable: true },
		{ key: 'library_prep_date', label: 'Date', sortable: true }
	];

	async function deletePlate(row: Record<string, unknown>) {
		if (!confirm(`Delete library plate "${row.plate_name}"?`)) return;
		await fetch(`/api/library-plates/${row.id}`, { method: 'DELETE' });
		allPlates = allPlates.filter(p => p.id !== row.id);
	}

	async function duplicatePlate(row: Record<string, unknown>) {
		const res = await fetch(`/api/library-plates/${row.id}`);
		if (!res.ok) return;
		const orig = await res.json();
		const libsRes = await fetch(`/api/libraries?plate_id=${row.id}`);
		const libs = libsRes.ok ? await libsRes.json() : [];
		const body = {
			...orig, plate_name: `${orig.plate_name} (copy)`,
			libraries: libs.map((l: any) => ({ pcr_id: l.pcr_id, extract_id: l.extract_id, library_name: `${l.library_name}_copy`, index_sequence_i7: l.index_sequence_i7, index_sequence_i5: l.index_sequence_i5, barcode: l.barcode, final_concentration_ng_ul: l.final_concentration_ng_ul })),
			id: undefined, created_at: undefined, updated_at: undefined
		};
		const created = await fetch('/api/library-plates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (created.ok) { const p = await created.json(); goto(`/libraries/${p.id}`); }
	}

	async function bulkDeletePlates(rs: Record<string, unknown>[]) {
		if (!confirm(`Delete ${rs.length} library plates?`)) return;
		const ids = rs.map((r) => r.id as string);
		await Promise.all(ids.map((id) => fetch(`/api/library-plates/${id}`, { method: 'DELETE' })));
		const removed = new Set(ids);
		allPlates = allPlates.filter((p) => !removed.has(p.id));
		selectedIds = new Set([...selectedIds].filter((id) => !removed.has(id)));
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-white">Libraries</h1>
		<div class="flex items-center gap-2">
			{#if selectionChanged}
				<button onclick={updateCart} class="px-3 py-2 border border-ocean-700 text-ocean-400 rounded-lg hover:bg-ocean-900/30 transition-colors text-sm font-medium">
					Update Cart ({selectedIds.size})
				</button>
			{/if}
			<a href="/libraries/new" class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">New Plate</a>
		</div>
	</div>

	<DataTable
		columns={plateColumns}
		rows={plates}
		bind:selectedIds
		bind:cartFilterActive={parentFilterActive}
		href={(row) => `/libraries/${row.id}`}
		selectable
		empty="No library plates yet."
		showId
		filterable
		cartFilterLabel={hasParentFilter ? `showing ${plates.length}/${allPlates.length} plates` : ''}
		editHref={(row) => `/libraries/${row.id}/edit`}
		ondelete={deletePlate}
		onduplicate={duplicatePlate}
		onbulkdelete={bulkDeletePlates}
	/>

	{#if orphanLibraries.length > 0}
		<div class="pt-4">
			<h2 class="text-lg font-semibold text-white mb-3">Individual Libraries (no plate)</h2>
			<DataTable columns={libColumns} bind:rows={orphanLibraries} href={(row) => `/libraries/lib/${row.id}`} empty="" showId />
		</div>
	{/if}
</div>
