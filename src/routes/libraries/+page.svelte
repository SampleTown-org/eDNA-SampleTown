<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let plates = $state(data.plates as any[]);
	let orphanLibraries = $state(data.orphanLibraries as any[]);

	const plateColumns = [
		{ key: 'plate_name', label: 'Plate', sortable: true },
		{ key: 'library_type', label: 'Type', sortable: true },
		{ key: 'platform', label: 'Platform', sortable: true },
		{ key: 'pcr_plate_name', label: 'PCR Plate', sortable: true },
		{ key: 'library_count', label: 'Libraries', sortable: true },
		{ key: 'library_prep_date', label: 'Date', sortable: true }
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
		plates = plates.filter(p => p.id !== row.id);
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
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-white">Libraries</h1>
		<a href="/libraries/new" class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">New Plate</a>
	</div>

	<DataTable
		columns={plateColumns}
		bind:rows={plates}
		href={(row) => `/libraries/${row.id}`}
		empty="No library plates yet."
		showId
		editHref={(row) => `/libraries/${row.id}/edit`}
		ondelete={deletePlate}
		onduplicate={duplicatePlate}
	/>

	{#if orphanLibraries.length > 0}
		<div class="pt-4">
			<h2 class="text-lg font-semibold text-white mb-3">Individual Libraries (no plate)</h2>
			<DataTable columns={libColumns} bind:rows={orphanLibraries} href={(row) => `/libraries/lib/${row.id}`} empty="" showId />
		</div>
	{/if}
</div>
