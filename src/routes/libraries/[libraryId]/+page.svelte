<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import PeopleRoster from '$lib/components/PeopleRoster.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	const libColumns = [
		{ key: 'well_label', label: 'Well', sortable: true },
		{ key: 'library_name', label: 'Library', sortable: true },
		{ key: 'source_name', label: 'Source', sortable: true },
		{ key: 'index_sequence_i7', label: 'i7', sortable: true },
		{ key: 'index_sequence_i5', label: 'i5', sortable: true },
		{ key: 'final_concentration_ng_ul', label: 'Conc. ng/µL', sortable: true }
	];

	const runColumns = [
		{ key: 'run_name', label: 'Run', sortable: true },
		{ key: 'platform', label: 'Platform', sortable: true },
		{ key: 'run_date', label: 'Date', sortable: true }
	];
</script>

<div class="space-y-6">
{#if data.type === 'plate'}
	<div>
		<a href="/libraries" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Library Plates</a>
		<div class="flex items-center justify-between mt-1">
			<div class="flex items-center gap-3">
				<h1 class="text-2xl font-bold text-white">{data.plate.plate_name}</h1>
				<span class="px-2 py-0.5 text-xs rounded bg-slate-800 text-slate-300">{data.plate.library_type}</span>
			</div>
			<a href="/libraries/{data.plate.id}/edit" class="px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Edit</a>
		</div>
		{#if data.plate.pcr_plate_name}
			<p class="text-slate-400 mt-1">From PCR Plate: <a href="/pcr/{data.plate.pcr_plate_id}" class="text-ocean-400 hover:text-ocean-300">{data.plate.pcr_plate_name}</a></p>
		{/if}
	</div>

	<div class="rounded-lg border border-slate-800 p-5">
		<dl class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
			{#each [
				['Type', data.plate.library_type],
				['Platform', data.plate.platform],
				['Instrument', data.plate.instrument_model],
				['Prep Kit', data.plate.library_prep_kit],
				['Fragment Size', data.plate.fragment_size_bp != null ? `${data.plate.fragment_size_bp} bp` : null],
				['Prep Date', data.plate.library_prep_date]
			] as [label, value]}
				{#if value != null}
				<div class="flex justify-between py-1 border-b border-slate-800/50">
					<dt class="text-slate-400">{label}</dt>
					<dd class="text-slate-200">{value}</dd>
				</div>
				{/if}
			{/each}
		</dl>
	</div>

	{#if data.plate.notes}
	<div class="rounded-lg border border-slate-800 p-5">
		<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-2">Notes</h2>
		<p class="text-sm text-slate-300">{data.plate.notes}</p>
	</div>
	{/if}

	{#if data.people && data.people.length > 0}
	<div class="rounded-lg border border-slate-800 p-5 space-y-3">
		<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">People</h2>
		<PeopleRoster people={data.people} />
	</div>
	{/if}

	<div>
		<h2 class="text-lg font-semibold text-white mb-3">Libraries ({data.libraries.length})</h2>
		<DataTable columns={libColumns} rows={data.libraries} href={(row) => `/libraries/lib/${row.id}`} empty="No libraries on this plate." />
	</div>

	{#if data.runs.length > 0}
	<div>
		<h2 class="text-lg font-semibold text-white mb-3">Sequencing Runs ({data.runs.length})</h2>
		<DataTable columns={runColumns} rows={data.runs} href={(row) => `/runs/${row.id}`} empty="" />
	</div>
	{/if}

{:else}
	<!-- Individual library (backward compat) -->
	<div>
		<a href="/libraries" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Libraries</a>
		<div class="flex items-center justify-between mt-1">
			<h1 class="text-2xl font-bold text-white">{data.library.library_name}</h1>
			<a href="/libraries/{data.library.id}/edit" class="px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Edit</a>
		</div>
		{#if data.source}
			<p class="text-slate-400 mt-1">
				<a href="/samples/{data.source.sample_id}" class="text-ocean-400 hover:text-ocean-300">{data.source.sample_name}</a>
				&rarr;
				<a href="/{data.source.type === 'PCR' ? 'pcr' : 'extracts'}/{data.source.id}" class="text-ocean-400 hover:text-ocean-300">{data.source.name}</a>
			</p>
		{/if}
	</div>

	<div class="rounded-lg border border-slate-800 p-5">
		<dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
			{#each [
				['Well', data.library.well_label],
				['Type', data.library.library_type],
				['Platform', data.library.platform],
				['Instrument', data.library.instrument_model],
				['Prep Kit', data.library.library_prep_kit],
				['i7 Index', data.library.index_sequence_i7],
				['i5 Index', data.library.index_sequence_i5],
				['Barcode', data.library.barcode],
				['Fragment Size', data.library.fragment_size_bp != null ? `${data.library.fragment_size_bp} bp` : null],
				['Concentration', data.library.final_concentration_ng_ul != null ? `${data.library.final_concentration_ng_ul} ng/µL` : null],
				['Prep Date', data.library.library_prep_date]
			] as [label, value]}
				{#if value != null}
				<div class="flex justify-between py-1 border-b border-slate-800/50">
					<dt class="text-slate-400">{label}</dt><dd class="text-slate-200">{value}</dd>
				</div>
				{/if}
			{/each}
		</dl>
	</div>

	<div>
		<h2 class="text-lg font-semibold text-white mb-3">Sequencing Runs ({data.runs.length})</h2>
		<DataTable columns={runColumns} rows={data.runs} href={(row) => `/runs/${row.id}`} empty="Not yet sequenced." />
	</div>
{/if}
</div>
