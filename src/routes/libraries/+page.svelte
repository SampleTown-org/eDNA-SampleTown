<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const columns = [
		{ key: 'library_name', label: 'Library', sortable: true },
		{ key: 'library_type', label: 'Type', sortable: true },
		{ key: 'platform', label: 'Platform', sortable: true },
		{ key: 'library_prep_date', label: 'Date', sortable: true }
	];
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-white">Library Preps</h1>
		<a href="/libraries/new" class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">New Library</a>
	</div>
	<DataTable {columns} rows={data.libraries} href={(row) => `/libraries/${row.id}`} empty="No library preps yet." />
</div>
