<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import PeopleRoster from '$lib/components/PeopleRoster.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	const pcrColumns = [
		{ key: 'pcr_name', label: 'PCR', sortable: true },
		{ key: 'target_gene', label: 'Target', sortable: true },
		{ key: 'target_subfragment', label: 'Region', sortable: true },
		{ key: 'concentration_ng_ul', label: 'Conc.', sortable: true },
		{ key: 'pcr_date', label: 'Date', sortable: true }
	];
	const libColumns = [
		{ key: 'library_name', label: 'Library', sortable: true },
		{ key: 'library_type', label: 'Type', sortable: true },
		{ key: 'platform', label: 'Platform', sortable: true }
	];

	const fields = [
		['Extraction Method', data.extract.extraction_method],
		['Concentration', data.extract.concentration_ng_ul != null ? `${data.extract.concentration_ng_ul} ng/µL` : null],
		['Volume', data.extract.total_volume_ul != null ? `${data.extract.total_volume_ul} µL` : null],
		['260/280', data.extract.a260_280],
		['260/230', data.extract.a260_230],
		['Quantification', data.extract.quantification_method],
		['Storage', data.extract.storage_location],
		['Date', data.extract.extraction_date]
	];
</script>

<div class="space-y-6">
	<div>
		<a href="/extracts" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Extracts</a>
		<div class="flex items-center justify-between mt-1">
			<h1 class="text-2xl font-bold text-white">{data.extract.extract_name}</h1>
			<a href="/extracts/{data.extract.id}/edit" class="px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Edit</a>
		</div>
		<p class="text-slate-400 mt-1">Sample: <a href="/samples/{data.extract.sample_id}" class="text-ocean-400 hover:text-ocean-300">{data.extract.samp_name}</a></p>
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

	{#if data.extract.notes}<div class="rounded-lg border border-slate-800 p-5"><h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-2">Notes</h2><p class="text-sm text-slate-300">{data.extract.notes}</p></div>{/if}

	{#if data.people.length > 0}
		<div class="rounded-lg border border-slate-800 p-5 space-y-3">
			<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">People</h2>
			<PeopleRoster people={data.people} />
		</div>
	{/if}

	<div>
		<div class="flex items-center justify-between mb-3">
			<h2 class="text-lg font-semibold text-white">PCR Amplifications ({data.pcrs.length})</h2>
			<a href="/pcr/new?extract_id={data.extract.id}" class="px-3 py-1.5 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">Add PCR</a>
		</div>
		<DataTable columns={pcrColumns} rows={data.pcrs} href={(row) => `/pcr/${row.id}`} empty="No PCR amplifications yet." />
	</div>

	<div>
		<div class="flex items-center justify-between mb-3">
			<h2 class="text-lg font-semibold text-white">Direct Library Preps ({data.libraries.length})</h2>
			<a href="/libraries/new?extract_id={data.extract.id}" class="px-3 py-1.5 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">Add Library</a>
		</div>
		<DataTable columns={libColumns} rows={data.libraries} href={(row) => `/libraries/${row.id}`} empty="No direct library preps yet." />
	</div>
</div>
