<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const columns = [
		{ key: 'run_name', label: 'Run', sortable: true },
		{ key: 'platform', label: 'Platform', sortable: true },
		{ key: 'instrument_model', label: 'Instrument', sortable: true },
		{ key: 'total_reads', label: 'Reads', sortable: true },
		{ key: 'run_date', label: 'Date', sortable: true }
	];
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-white">Sequencing Runs</h1>
		<a href="/runs/new" class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">New Run</a>
	</div>
	<DataTable {columns} rows={data.runs} href={(row) => `/runs/${row.id}`} empty="No sequencing runs yet." />
</div>
