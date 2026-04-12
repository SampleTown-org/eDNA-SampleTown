<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const sampleColumns = [
		{ key: 'samp_name', label: 'Sample', sortable: true },
		{ key: 'mixs_checklist', label: 'Checklist', sortable: true },
		{ key: 'site_name', label: 'Site', sortable: true },
		{ key: 'collection_date', label: 'Collected', sortable: true }
	];
</script>

<div class="space-y-6">
	<div>
		<a href="/projects" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Projects</a>
		<div class="flex items-center justify-between mt-1">
			<h1 class="text-2xl font-bold text-white">{data.project.project_name}</h1>
			<a href="/projects/{data.project.id}/edit" class="px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Edit</a>
		</div>
		{#if data.project.description}
			<p class="text-slate-400 mt-1">{data.project.description}</p>
		{/if}
	</div>

	<div class="flex gap-4 text-sm text-slate-400">
		{#if data.project.pi_name}
			<span>PI: <span class="text-slate-300">{data.project.pi_name}</span></span>
		{/if}
		{#if data.project.institution}
			<span>Institution: <span class="text-slate-300">{data.project.institution}</span></span>
		{/if}
	</div>

	<div class="flex items-center justify-between">
		<h2 class="text-lg font-semibold text-white">Samples ({data.samples.length})</h2>
		<a
			href="/samples/new?project_id={data.project.id}"
			class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium"
		>
			Add Sample
		</a>
	</div>

	<DataTable
		columns={sampleColumns}
		rows={data.samples}
		href={(row) => `/samples/${row.id}`}
		empty="No samples yet. Add one to get started."
	/>
</div>
