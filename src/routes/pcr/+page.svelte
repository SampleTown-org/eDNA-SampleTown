<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const columns = [
		{ key: 'pcr_name', label: 'PCR', sortable: true },
		{ key: 'extract_name', label: 'Extract', sortable: true },
		{ key: 'target_gene', label: 'Target Gene', sortable: true },
		{ key: 'target_subfragment', label: 'Region', sortable: true },
		{ key: 'pcr_date', label: 'Date', sortable: true }
	];
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-white">PCR Amplifications</h1>
		<a href="/pcr/new" class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">New PCR</a>
	</div>
	<DataTable {columns} rows={data.pcrs} href={(row) => `/pcr/${row.id}`} empty="No PCR amplifications yet." />
</div>
