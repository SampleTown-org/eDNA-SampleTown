<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import EntityQR from '$lib/components/EntityQR.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const crumbs = $derived([
		{ label: data.lab?.name ?? 'Lab', href: '/' },
		{ label: 'Projects', href: '/projects' },
		{ label: (data.project as any).project_name }
	]);

	const siteColumns = [
		{ key: 'site_name', label: 'Site', sortable: true },
		{ key: 'geo_loc_name', label: 'Location', sortable: true },
		{ key: 'env_local_scale', label: 'Feature', sortable: true },
		{ key: 'sample_count', label: 'Samples', sortable: true }
	];

	const sampleColumns = [
		{ key: 'samp_name', label: 'Sample', sortable: true },
		{ key: 'mixs_checklist', label: 'Checklist', sortable: true },
		{ key: 'site_name', label: 'Site', sortable: true },
		{ key: 'collection_date', label: 'Collected', sortable: true }
	];
</script>

<div class="space-y-6">
	<div>
		<div class="flex items-start justify-between gap-4">
			<div>
				<h1 class="text-2xl font-bold text-white">{data.project.project_name}</h1>
				<Breadcrumb items={crumbs} />
			</div>
			<div class="flex items-center gap-3 shrink-0">
				<EntityQR id={data.project.id} size={96} />
				<a href="/projects/{data.project.id}/edit" class="hidden sm:inline-flex write-only px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Edit</a>
			</div>
		</div>
		{#if data.project.description}
			<p class="text-slate-400 mt-1">{data.project.description}</p>
		{/if}
	</div>

	<div class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-400">
		{#if data.project.pi_name}
			<span>PI: <span class="text-slate-300">{data.project.pi_name}</span></span>
		{/if}
		{#if data.project.institution}
			<span>Institution: <span class="text-slate-300">{data.project.institution}</span></span>
		{/if}
		{#if data.project.contact_email}
			<span>Contact: <a href="mailto:{data.project.contact_email}" class="text-ocean-400 hover:text-ocean-300">{data.project.contact_email}</a></span>
		{/if}
	</div>

	{#if data.project.funding_sources}
		<div class="text-sm">
			<div class="text-slate-400 mb-1">Funding</div>
			<div class="text-slate-300 whitespace-pre-line p-3 rounded-lg border border-slate-800 bg-slate-900/40">{data.project.funding_sources}</div>
		</div>
	{/if}

	{#if data.roster.length > 0}
		<div>
			<h2 class="text-lg font-semibold text-white mb-2">People ({data.roster.length})</h2>
			<p class="text-xs text-slate-500 mb-2">
				Everyone who has a recorded role on this project's samples, extracts, PCR plates,
				library plates, or sequencing runs. Sorted by total contribution count.
			</p>
			<div class="overflow-x-auto rounded-lg border border-slate-800">
				<table class="w-full text-sm">
					<thead class="bg-slate-900/60 text-slate-400 text-xs uppercase tracking-wider">
						<tr>
							<th class="text-left px-3 py-2">Name</th>
							<th class="text-left px-3 py-2">Title</th>
							<th class="text-left px-3 py-2">Roles on this project</th>
							<th class="text-right px-3 py-2">Contributions</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-800">
						{#each data.roster as person}
							<tr class="hover:bg-slate-900/40">
								<td class="px-3 py-2">
									<div class="text-slate-200">{person.full_name}</div>
									{#if person.email}
										<a href="mailto:{person.email}" class="text-xs text-ocean-400 hover:text-ocean-300">{person.email}</a>
									{/if}
								</td>
								<td class="px-3 py-2 text-slate-300">{person.title ?? '—'}</td>
								<td class="px-3 py-2 text-slate-400 text-xs">{person.roles}</td>
								<td class="px-3 py-2 text-right text-slate-300">{person.total}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<!-- Permits linked to this project. Listing only: permits are recorded here
	     and carried into the MIxS export's attribution field, but nothing about
	     the export depends on them. -->
	<div class="rounded-lg border border-slate-800 p-5 space-y-2">
		<div class="flex items-center justify-between">
			<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Permits ({data.permits.length})</h2>
			<a href="/settings?tab=permits" class="text-xs text-ocean-400 hover:text-ocean-300">Manage →</a>
		</div>
		{#if data.permits.length === 0}
			<p class="text-sm text-slate-500">No permits linked to this project.</p>
		{:else}
			<ul class="text-sm text-slate-300 space-y-2">
				{#each data.permits as p (p.id)}
					{@const pa = p as any}
					<li class="p-2 rounded bg-slate-900/40">
						<div class="flex items-center justify-between">
							<div>
								<span class="text-white font-medium">{pa.name}</span>
								<span class="ml-1 text-xs text-ocean-400">{pa.permit_type}</span>
								{#if pa.identifier}<span class="ml-1 text-xs text-slate-500 font-mono">{pa.identifier}</span>{/if}
							</div>
							{#if pa.document_url}
								<a href={pa.document_url} target="_blank" rel="noopener noreferrer" class="text-xs text-ocean-400 hover:text-ocean-300">↗ Doc</a>
							{/if}
						</div>
						{#if pa.scopes.length === 0}
							<div class="text-xs text-amber-400 mt-0.5">No scope rows — permit covers nothing.</div>
						{:else}
							<ul class="text-xs text-slate-500 mt-0.5 space-y-0.5">
								{#each pa.scopes as s}
									{@const sa = s as any}
									<li>
										{sa.site_name ?? 'all sites'} · {sa.valid_from ?? '—'} → {sa.valid_until ?? '—'}
									</li>
								{/each}
							</ul>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<div class="flex items-center justify-between">
		<h2 class="text-lg font-semibold text-white">Sites ({data.sites.length})</h2>
		<a
			href="/sites/new?project_id={data.project.id}"
			class="hidden sm:inline-flex write-only px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium"
		>
			Add Site
		</a>
	</div>

	<DataTable
		columns={siteColumns}
		rows={data.sites}
		href={(row) => `/sites/${row.id}`}
		empty="No sites yet. Add a site first — samples are collected at sites."
	/>

	<div class="flex items-center justify-between">
		<h2 class="text-lg font-semibold text-white">Samples ({data.samples.length})</h2>
		<a
			href="/samples/new?project_id={data.project.id}"
			class="hidden sm:inline-flex write-only px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium"
			class:opacity-50={data.sites.length === 0}
			class:pointer-events-none={data.sites.length === 0}
		>
			Add Sample
		</a>
	</div>

	<DataTable
		columns={sampleColumns}
		rows={data.samples}
		href={(row) => `/samples/${row.id}`}
		empty={data.sites.length === 0 ? 'Add a site above before collecting samples.' : 'No samples yet at any of this project\u2019s sites.'}
	/>
</div>
