<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import PeopleRoster from '$lib/components/PeopleRoster.svelte';
	import { CHECKLISTS } from '$lib/mixs/checklists';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const extractColumns = [
		{ key: 'extract_name', label: 'Extract', sortable: true },
		{ key: 'extraction_method', label: 'Method', sortable: true },
		{ key: 'concentration_ng_ul', label: 'Conc. (ng/µL)', sortable: true },
		{ key: 'extraction_date', label: 'Date', sortable: true }
	];

	const coreFields = [
		['Collection Date', data.sample.collection_date],
		['Lat/Lon', data.sample.lat_lon],
		['Location', data.sample.geo_loc_name],
		['Broad-scale Env', data.sample.env_broad_scale],
		['Local Env', data.sample.env_local_scale],
		['Env Medium', data.sample.env_medium],
		['Taxon ID', data.sample.samp_taxon_id]
	];

	const measurements = [
		['Temperature', data.sample.temp, '°C'],
		['Salinity', data.sample.salinity, 'PSU'],
		['pH', data.sample.ph, ''],
		['Dissolved O₂', data.sample.dissolved_oxygen, 'mg/L'],
		['Pressure', data.sample.pressure, 'atm'],
		['Turbidity', data.sample.turbidity, 'NTU'],
		['Chlorophyll', data.sample.chlorophyll, 'µg/L'],
		['Nitrate', data.sample.nitrate, 'µmol/L'],
		['Phosphate', data.sample.phosphate, 'µmol/L']
	].filter(([_, v]) => v != null);
</script>

<div class="space-y-6">
	<div>
		<a href="/samples" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Samples</a>
		<div class="flex items-center justify-between mt-1">
			<div class="flex items-center gap-3">
				<h1 class="text-2xl font-bold text-white">{data.sample.samp_name}</h1>
				<span class="px-2 py-0.5 text-xs rounded bg-slate-800 text-slate-300">{data.sample.mixs_checklist}</span>
			</div>
			<a href="/samples/{data.sample.id}/edit" class="px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Edit</a>
		</div>
		<p class="text-slate-400 mt-1">
			Project: <a href="/projects/{data.sample.project_id}" class="text-ocean-400 hover:text-ocean-300">{data.sample.project_name}</a>
			{#if data.sample.site_name}
				&middot; Site: <a href="/sites/{data.sample.site_id}" class="text-ocean-400 hover:text-ocean-300">{data.sample.site_name}</a>
			{/if}
		</p>
	</div>

	<!-- Core fields -->
	<div class="rounded-lg border border-slate-800 p-5 space-y-3">
		<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">MIxS Core</h2>
		<dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
			{#each coreFields as [label, value]}
				<div class="flex justify-between py-1 border-b border-slate-800/50">
					<dt class="text-slate-400">{label}</dt>
					<dd class="text-slate-200">{value || '—'}</dd>
				</div>
			{/each}
		</dl>
	</div>

	<!-- Measurements (if any) -->
	{#if measurements.length > 0}
		<div class="rounded-lg border border-slate-800 p-5 space-y-3">
			<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Measurements</h2>
			<dl class="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
				{#each measurements as [label, value, unit]}
					<div class="flex justify-between py-1 border-b border-slate-800/50">
						<dt class="text-slate-400">{label}</dt>
						<dd class="text-slate-200">{value} {unit}</dd>
					</div>
				{/each}
			</dl>
		</div>
	{/if}

	<!-- Notes -->
	{#if data.sample.notes}
		<div class="rounded-lg border border-slate-800 p-5">
			<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-2">Notes</h2>
			<p class="text-sm text-slate-300">{data.sample.notes}</p>
		</div>
	{/if}

	{#if data.people.length > 0}
		<div class="rounded-lg border border-slate-800 p-5 space-y-3">
			<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">People</h2>
			<PeopleRoster people={data.people} />
		</div>
	{/if}

	<!-- DNA Extracts -->
	<div>
		<div class="flex items-center justify-between mb-3">
			<h2 class="text-lg font-semibold text-white">DNA Extracts ({data.extracts.length})</h2>
			<a
				href="/extracts/new?sample_id={data.sample.id}"
				class="px-3 py-1.5 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium"
			>
				Add Extract
			</a>
		</div>
		<DataTable
			columns={extractColumns}
			rows={data.extracts}
			href={(row) => `/extracts/${row.id}`}
			empty="No extracts yet."
		/>
	</div>

</div>
