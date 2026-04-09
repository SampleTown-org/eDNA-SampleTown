<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const columns = [
		{ key: 'extract_name', label: 'Extract', sortable: true },
		{ key: 'samp_name', label: 'Sample', sortable: true },
		{ key: 'extraction_method', label: 'Method', sortable: true },
		{ key: 'concentration_ng_ul', label: 'Conc. (ng/µL)', sortable: true },
		{ key: 'extraction_date', label: 'Date', sortable: true }
	];
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-white">DNA Extracts</h1>
		<a href="/extracts/new" class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">New Extract</a>
	</div>
	<DataTable {columns} rows={data.extracts} href={(row) => `/extracts/${row.id}`} empty="No extracts yet." />
</div>
