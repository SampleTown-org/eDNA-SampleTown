<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let plates = $state(data.plates as any[]);
	let orphanReactions = $state(data.orphanReactions as any[]);

	const plateColumns = [
		{ key: 'plate_name', label: 'Plate', sortable: true },
		{ key: 'target_gene', label: 'Target', sortable: true },
		{ key: 'target_subfragment', label: 'Region', sortable: true },
		{ key: 'forward_primer_name', label: 'Fwd Primer', sortable: true },
		{ key: 'reaction_count', label: 'Reactions', sortable: true },
		{ key: 'pcr_date', label: 'Date', sortable: true }
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
		plates = plates.filter(p => p.id !== row.id);
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
		<a href="/pcr/new" class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">New Plate</a>
	</div>

	<DataTable
		columns={plateColumns}
		bind:rows={plates}
		href={(row) => `/pcr/${row.id}`}
		empty="No PCR plates yet."
		showId
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
