<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	const libColumns = [
		{ key: 'library_name', label: 'Library', sortable: true },
		{ key: 'library_type', label: 'Type', sortable: true },
		{ key: 'platform', label: 'Platform', sortable: true }
	];

	const fields = [
		['Well', data.pcr.well_label],
		['Target Gene', data.pcr.target_gene],
		['Region', data.pcr.target_subfragment],
		['Forward Primer', data.pcr.forward_primer_name ? `${data.pcr.forward_primer_name} (${data.pcr.forward_primer_seq})` : data.pcr.forward_primer_seq],
		['Reverse Primer', data.pcr.reverse_primer_name ? `${data.pcr.reverse_primer_name} (${data.pcr.reverse_primer_seq})` : data.pcr.reverse_primer_seq],
		['Annealing Temp', data.pcr.annealing_temp_c != null ? `${data.pcr.annealing_temp_c}°C` : null],
		['Cycles', data.pcr.num_cycles],
		['Polymerase', data.pcr.polymerase],
		['Concentration', data.pcr.concentration_ng_ul != null ? `${data.pcr.concentration_ng_ul} ng/µL` : null],
		['Band', data.pcr.band_observed != null ? (data.pcr.band_observed ? 'Yes' : 'No') : null],
		['Date', data.pcr.pcr_date]
	];
</script>

<div class="space-y-6">
	<div>
		{#if data.pcr.plate_id}
			<a href="/pcr/{data.pcr.plate_id}" class="text-sm text-slate-400 hover:text-ocean-400">&larr; {data.pcr.plate_name}</a>
		{:else}
			<a href="/pcr" class="text-sm text-slate-400 hover:text-ocean-400">&larr; PCR</a>
		{/if}
		<div class="flex items-center justify-between mt-1">
			<h1 class="text-2xl font-bold text-white">{data.pcr.pcr_name}</h1>
			<a href="/pcr/{data.pcr.id}/edit" class="px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Edit</a>
		</div>
		<p class="text-slate-400 mt-1">
			<a href="/samples/{data.pcr.sample_id}" class="text-ocean-400 hover:text-ocean-300">{data.pcr.samp_name}</a>
			&rarr; <a href="/extracts/{data.pcr.extract_id}" class="text-ocean-400 hover:text-ocean-300">{data.pcr.extract_name}</a>
			{#if data.pcr.plate_name}
				&middot; Plate: <a href="/pcr/{data.pcr.plate_id}" class="text-ocean-400 hover:text-ocean-300">{data.pcr.plate_name}</a>
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

	{#if data.pcr.notes}<div class="rounded-lg border border-slate-800 p-5"><h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-2">Notes</h2><p class="text-sm text-slate-300">{data.pcr.notes}</p></div>{/if}

	<div>
		<div class="flex items-center justify-between mb-3">
			<h2 class="text-lg font-semibold text-white">Library Preps ({data.libraries.length})</h2>
			<a href="/libraries/new?pcr_id={data.pcr.id}" class="px-3 py-1.5 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">Add Library</a>
		</div>
		<DataTable columns={libColumns} rows={data.libraries} href={(row) => `/libraries/${row.id}`} empty="No library preps yet." />
	</div>
</div>
