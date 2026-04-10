<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	const runColumns = [
		{ key: 'run_name', label: 'Run', sortable: true },
		{ key: 'platform', label: 'Platform', sortable: true },
		{ key: 'run_date', label: 'Date', sortable: true }
	];

	const fields = [
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
	];
</script>

<div class="space-y-6">
	<div>
		{#if data.plate}
			<a href="/libraries/{data.plate.id}" class="text-sm text-slate-400 hover:text-ocean-400">&larr; {data.plate.plate_name}</a>
		{:else}
			<a href="/libraries" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Libraries</a>
		{/if}
		<h1 class="text-2xl font-bold text-white mt-1">{data.library.library_name}</h1>
		<p class="text-slate-400 mt-1">
			{#if data.source}
				<a href="/samples/{data.source.sample_id}" class="text-ocean-400 hover:text-ocean-300">{data.source.sample_name}</a>
				&rarr;
				<a href="/{data.source.type === 'PCR' ? 'pcr/reaction' : 'extracts'}/{data.source.id}" class="text-ocean-400 hover:text-ocean-300">{data.source.name}</a>
			{/if}
			{#if data.plate}
				&middot; Plate: <a href="/libraries/{data.plate.id}" class="text-ocean-400 hover:text-ocean-300">{data.plate.plate_name}</a>
			{/if}
		</p>
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

	<div>
		<h2 class="text-lg font-semibold text-white mb-3">Sequencing Runs ({data.runs.length})</h2>
		<DataTable columns={runColumns} rows={data.runs} href={(row) => `/runs/${row.id}`} empty="Not yet sequenced." />
	</div>
</div>
