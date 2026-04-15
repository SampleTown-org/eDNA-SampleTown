<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import PeopleRoster from '$lib/components/PeopleRoster.svelte';
	import EntityQR from '$lib/components/EntityQR.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	const crumbs = $derived([
		{ label: data.lab?.name ?? 'Lab', href: '/' },
		{ label: 'Sequencing Runs', href: '/runs' },
		{ label: (data.run as any).run_name }
	]);

	const libColumns = [
		{ key: 'library_name', label: 'Library', sortable: true },
		{ key: 'library_type', label: 'Type', sortable: true },
		{ key: 'platform', label: 'Platform', sortable: true }
	];
	const analysisColumns = [
		{ key: 'pipeline', label: 'Pipeline', sortable: true },
		{ key: 'pipeline_profile', label: 'Profile', sortable: true },
		{ key: 'status', label: 'Status', sortable: true },
		{ key: 'launched_at', label: 'Launched', sortable: true }
	];

	const fields = [
		['Platform', data.run.platform],
		['Instrument', data.run.instrument_model],
		['Flow Cell', data.run.flow_cell_id],
		['FASTQ Dir', data.run.fastq_directory],
		['Total Reads', data.run.total_reads?.toLocaleString()],
		['Total Bases', data.run.total_bases?.toLocaleString()],
		['Run Date', data.run.run_date]
	];
</script>

<div class="space-y-6">
	<div>
		<div class="flex items-start justify-between gap-4">
			<div>
				<h1 class="text-2xl font-bold text-white">{data.run.run_name}</h1>
				<Breadcrumb items={crumbs} />
			</div>
			<div class="flex items-center gap-3 shrink-0">
				<EntityQR id={data.run.id} size={96} />
				<a href="/runs/{data.run.id}/edit" class="hidden sm:inline-flex write-only px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Edit</a>
			</div>
		</div>
	</div>

	<div class="rounded-lg border border-slate-800 p-5">
		<dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
			{#each fields as [label, value]}
				{#if value != null}
					<div class="flex justify-between py-1 border-b border-slate-800/50">
						<dt class="text-slate-400">{label}</dt><dd class="text-slate-200">{value}</dd>
					</div>
				{/if}
			{/each}
		</dl>
	</div>

	{#if data.people.length > 0}
		<div class="rounded-lg border border-slate-800 p-5 space-y-3">
			<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">People</h2>
			<PeopleRoster people={data.people} />
		</div>
	{/if}

	<div>
		<h2 class="text-lg font-semibold text-white mb-3">Libraries ({data.libraries.length})</h2>
		<DataTable columns={libColumns} rows={data.libraries} href={(row) => `/libraries/${row.id}`} empty="No libraries attached." />
	</div>

	<div>
		<h2 class="text-lg font-semibold text-white mb-3">Analyses ({data.analyses.length})</h2>
		<DataTable columns={analysisColumns} rows={data.analyses} href={(row) => `/analysis/${row.id}`} empty="No analyses yet." />
	</div>
</div>
