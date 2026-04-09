<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const columns = [
		{ key: 'samp_name', label: 'Sample', sortable: true },
		{ key: 'project_name', label: 'Project', sortable: true },
		{ key: 'mixs_checklist', label: 'Checklist', sortable: true },
		{ key: 'env_package', label: 'Env Package', sortable: true },
		{ key: 'geo_loc_name', label: 'Location', sortable: true },
		{ key: 'collection_date', label: 'Collected', sortable: true }
	];
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-white">Samples</h1>
		<a
			href="/samples/new"
			class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium"
		>
			New Sample
		</a>
	</div>

	<DataTable
		{columns}
		rows={data.samples}
		href={(row) => `/samples/${row.id}`}
		empty="No samples yet."
	/>
</div>
