<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import MapPicker from '$lib/components/MapPicker.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const locationFields = [
		['Lat/Lon', data.site.lat_lon],
		['Geographic Location', data.site.geo_loc_name],
		['Locality', data.site.locality],
		['Habitat Type', data.site.habitat_type],
		['Depth', data.site.depth],
		['Elevation', data.site.elevation]
	].filter(([_, v]) => v);

	const envFields = [
		['Env Package', data.site.env_package],
		['Broad-scale Env', data.site.env_broad_scale],
		['Local Env', data.site.env_local_scale],
		['Env Medium', data.site.env_medium]
	].filter(([_, v]) => v);

	const sampleColumns = [
		{ key: 'samp_name', label: 'Sample', sortable: true },
		{ key: 'mixs_checklist', label: 'Checklist', sortable: true },
		{ key: 'collection_date', label: 'Collected', sortable: true },
		{ key: 'collector_name', label: 'Collector', sortable: true }
	];
</script>

<div class="space-y-6">
	<div>
		<a href="/sites" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Sites</a>
		<div class="flex items-center justify-between mt-1">
			<div class="flex items-center gap-3">
				<h1 class="text-2xl font-bold text-white">{data.site.site_name}</h1>
				{#if data.site.env_package}
					<span class="px-2 py-0.5 text-xs rounded bg-slate-800 text-slate-300">{data.site.env_package}</span>
				{/if}
			</div>
			<a href="/sites/{data.site.id}/edit" class="px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Edit</a>
		</div>
		<p class="text-slate-400 mt-1">
			Project: <a href="/projects/{data.site.project_id}" class="text-ocean-400 hover:text-ocean-300">{data.site.project_name}</a>
		</p>
		{#if data.site.description}
			<p class="text-slate-300 mt-2 text-sm">{data.site.description}</p>
		{/if}
	</div>

	{#if data.site.latitude != null && data.site.longitude != null}
		<MapPicker latitude={data.site.latitude} longitude={data.site.longitude} readonly height="250px" />
	{/if}

	{#if locationFields.length > 0}
	<div class="rounded-lg border border-slate-800 p-5 space-y-3">
		<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Location</h2>
		<dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
			{#each locationFields as [label, value]}
				<div class="flex justify-between py-1 border-b border-slate-800/50">
					<dt class="text-slate-400">{label}</dt>
					<dd class="text-slate-200">{value}</dd>
				</div>
			{/each}
		</dl>
	</div>
	{/if}

	{#if envFields.length > 0}
	<div class="rounded-lg border border-slate-800 p-5 space-y-3">
		<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Environment</h2>
		<dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
			{#each envFields as [label, value]}
				<div class="flex justify-between py-1 border-b border-slate-800/50">
					<dt class="text-slate-400">{label}</dt>
					<dd class="text-slate-200">{value}</dd>
				</div>
			{/each}
		</dl>
	</div>
	{/if}

	{#if data.site.access_notes}
	<div class="rounded-lg border border-slate-800 p-5">
		<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-2">Access Notes</h2>
		<p class="text-sm text-slate-300">{data.site.access_notes}</p>
	</div>
	{/if}

	{#if data.site.notes}
	<div class="rounded-lg border border-slate-800 p-5">
		<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-2">Notes</h2>
		<p class="text-sm text-slate-300">{data.site.notes}</p>
	</div>
	{/if}

	<!-- Samples at this site -->
	<div>
		<div class="flex items-center justify-between mb-3">
			<h2 class="text-lg font-semibold text-white">Samples ({data.samples.length})</h2>
			<a
				href="/samples/new?site_id={data.site.id}&project_id={data.site.project_id}"
				class="px-3 py-1.5 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium"
			>
				Add Sample
			</a>
		</div>
		<DataTable
			columns={sampleColumns}
			rows={data.samples}
			href={(row) => `/samples/${row.id}`}
			empty="No samples at this site yet."
		/>
	</div>

</div>
