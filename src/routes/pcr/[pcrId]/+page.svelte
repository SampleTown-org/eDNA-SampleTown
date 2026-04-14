<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import PeopleRoster from '$lib/components/PeopleRoster.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	const reactionColumns = [
		{ key: 'well_label', label: 'Well', sortable: true },
		{ key: 'pcr_name', label: 'Reaction', sortable: true },
		{ key: 'extract_name', label: 'Extract', sortable: true },
		{ key: 'samp_name', label: 'Sample', sortable: true },
		{ key: 'band_observed', label: 'Band', sortable: true },
		{ key: 'concentration_ng_ul', label: 'Conc. ng/µL', sortable: true }
	];

	const libColumns = [
		{ key: 'library_name', label: 'Library', sortable: true },
		{ key: 'library_type', label: 'Type', sortable: true },
		{ key: 'platform', label: 'Platform', sortable: true }
	];
</script>

<div class="space-y-6">
	{#if data.type === 'plate'}
	<!-- PLATE VIEW -->
	<div>
		<a href="/pcr" class="text-sm text-slate-400 hover:text-ocean-400">&larr; PCR Plates</a>
		<div class="flex items-center justify-between mt-1">
			<div class="flex items-center gap-3">
				<h1 class="text-2xl font-bold text-white">{data.plate.plate_name}</h1>
				<span class="px-2 py-0.5 text-xs rounded bg-slate-800 text-slate-300">{data.plate.target_gene}{data.plate.target_subfragment ? ` ${data.plate.target_subfragment}` : ''}</span>
			</div>
			<a href="/pcr/{data.plate.id}/edit" class="px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Edit</a>
		</div>
	</div>

	<!-- Plate conditions -->
	<div class="rounded-lg border border-slate-800 p-5">
		<dl class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
			{#each [
				['Date', data.plate.pcr_date],
				['Target Gene', data.plate.target_gene],
				['Region', data.plate.target_subfragment],
				['Forward Primer', data.plate.forward_primer_name ? `${data.plate.forward_primer_name}` : null],
				['Fwd Sequence', data.plate.forward_primer_seq],
				['Reverse Primer', data.plate.reverse_primer_name ? `${data.plate.reverse_primer_name}` : null],
				['Rev Sequence', data.plate.reverse_primer_seq],
				['Anneal Temp', data.plate.annealing_temp_c != null ? `${data.plate.annealing_temp_c}°C` : null],
				['Cycles', data.plate.num_cycles],
				['Polymerase', data.plate.polymerase],
				['Conditions', data.plate.pcr_cond]
			] as [label, value]}
				{#if value != null}
				<div class="flex justify-between py-1 border-b border-slate-800/50">
					<dt class="text-slate-400">{label}</dt>
					<dd class="text-slate-200 font-mono text-xs">{value}</dd>
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

	<!-- Reactions -->
	<div>
		<div class="flex items-center justify-between mb-3">
			<h2 class="text-lg font-semibold text-white">Reactions ({data.reactions.length})</h2>
		</div>
		<DataTable columns={reactionColumns} rows={data.reactions.map((r) => ({...r, band_observed: r.band_observed != null ? (r.band_observed ? 'Yes' : 'No') : '—'}))} href={(row) => `/pcr/reaction/${row.id}`} empty="No reactions yet." />
	</div>

	{#if data.libraries.length > 0}
	<div>
		<h2 class="text-lg font-semibold text-white mb-3">Library Preps ({data.libraries.length})</h2>
		<DataTable columns={libColumns} rows={data.libraries} href={(row) => `/libraries/${row.id}`} empty="" />
	</div>
	{/if}

	{:else}
	<!-- SINGLE REACTION VIEW (backward compat) -->
	<div>
		<a href="/pcr" class="text-sm text-slate-400 hover:text-ocean-400">&larr; PCR</a>
		<div class="flex items-center justify-between mt-1">
			<h1 class="text-2xl font-bold text-white">{data.pcr.pcr_name}</h1>
			<a href="/pcr/{data.pcr.id}/edit" class="px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Edit</a>
		</div>
		<p class="text-slate-400 mt-1">
			<a href="/samples/{data.pcr.sample_id}" class="text-ocean-400 hover:text-ocean-300">{data.pcr.samp_name}</a>
			&rarr; <a href="/extracts/{data.pcr.extract_id}" class="text-ocean-400 hover:text-ocean-300">{data.pcr.extract_name}</a>
		</p>
	</div>

	<div class="rounded-lg border border-slate-800 p-5">
		<dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
			{#each [
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
			] as [label, value]}
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
	{/if}
</div>
