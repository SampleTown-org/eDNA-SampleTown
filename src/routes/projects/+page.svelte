<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const columns = [
		{ key: 'project_name', label: 'Project', sortable: true },
		{ key: 'pi_name', label: 'PI', sortable: true },
		{ key: 'institution', label: 'Institution', sortable: true },
		{ key: 'sample_count', label: 'Samples', sortable: true },
		{ key: 'created_at', label: 'Created', sortable: true }
	];
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-white">Projects</h1>
		<a
			href="/projects/new"
			class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium"
		>
			New Project
		</a>
	</div>

	<DataTable
		{columns}
		rows={data.projects}
		href={(row) => `/projects/${row.id}`}
		empty="No projects yet. Create one to get started."
	/>
</div>
