<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const columns = [
		{ key: 'pipeline', label: 'Pipeline', sortable: true },
		{ key: 'pipeline_profile', label: 'Profile', sortable: true },
		{ key: 'status', label: 'Status', sortable: true },
		{ key: 'run_name', label: 'Run', sortable: true },
		{ key: 'launched_at', label: 'Launched', sortable: true }
	];
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-white">Analyses</h1>
	</div>
	<DataTable {columns} rows={data.analyses} href={(row) => `/analysis/${row.id}`} empty="No analyses yet." />
</div>
