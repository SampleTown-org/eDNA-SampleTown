<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import PeopleRoster from '$lib/components/PeopleRoster.svelte';
	import GlossaryDoc from '$lib/components/GlossaryDoc.svelte';
	import EntityQR from '$lib/components/EntityQR.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	// Plate has many sources; reaction has a single linear chain.
	const crumbs = $derived.by(() => {
		if (data.type === 'plate') {
			return [
				{ label: data.lab?.name ?? 'Lab', href: '/' },
				{ label: 'PCR Plates', href: '/pcr' },
				{ label: (data.plate as any).plate_name }
			];
		}
		const r = data.pcr as any;
		return [
			{ label: data.lab?.name ?? 'Lab', href: '/' },
			{ label: 'Projects', href: '/projects' },
			{ label: r.project_name, href: `/projects/${r.project_id}` },
			{ label: 'Sites', href: '/sites' },
			{ label: r.site_name, href: `/sites/${r.site_id}` },
			{ label: 'Samples', href: '/samples' },
			{ label: r.samp_name, href: `/samples/${r.sample_id}` },
			{ label: 'Extracts', href: '/extracts' },
			{ label: r.extract_name, href: `/extracts/${r.extract_id}` },
			{ label: r.pcr_name }
		];
	});

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
		<Breadcrumb items={crumbs} />
		<div class="flex items-start justify-between mt-1 gap-4">
			<div class="flex items-center gap-3 flex-wrap">
				<h1 class="text-2xl font-bold text-white">{data.plate.plate_name}</h1>
				<span class="px-2 py-0.5 text-xs rounded bg-slate-800 text-slate-300">{data.plate.target_gene}{data.plate.target_subfragment ? ` ${data.plate.target_subfragment}` : ''}</span>
			</div>
			<div class="flex items-center gap-3 shrink-0">
				<EntityQR id={data.plate.id} size={96} />
				<a href="/pcr/{data.plate.id}/edit" class="hidden sm:inline-flex write-only px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Edit</a>
			</div>
		</div>
	</div>

	<!-- Plate conditions -->
	<div class="rounded-lg border border-slate-800 p-5">
		<dl class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
			{#each [
				['Date', data.plate.pcr_date, undefined],
				['Target Gene', data.plate.target_gene, 'target_gene'],
				['Region', data.plate.target_subfragment, 'target_subfragment'],
				['Forward Primer', data.plate.forward_primer_name ? `${data.plate.forward_primer_name}` : null, undefined],
				['Fwd Sequence', data.plate.forward_primer_seq, undefined],
				['Reverse Primer', data.plate.reverse_primer_name ? `${data.plate.reverse_primer_name}` : null, undefined],
				['Rev Sequence', data.plate.reverse_primer_seq, undefined],
				['Anneal Temp', data.plate.annealing_temp_c != null ? `${data.plate.annealing_temp_c}°C` : null, undefined],
				['Cycles', data.plate.num_cycles, undefined],
				['Conditions', data.plate.pcr_cond, 'pcr_cond'],
				['Amplification Protocol (MIxS)', data.plate.nucl_acid_amp, 'nucl_acid_amp']
			] as [label, value, slot]}
				{#if value != null}
				<div class="flex justify-between py-1 border-b border-slate-800/50">
					<dt class="text-slate-400">
						{#if slot}<GlossaryDoc {slot} {label} />{:else}{label}{/if}
					</dt>
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
		<Breadcrumb items={crumbs} />
		<div class="flex items-start justify-between mt-1 gap-4">
			<h1 class="text-2xl font-bold text-white">{data.pcr.pcr_name}</h1>
			<div class="flex items-center gap-3 shrink-0">
				<EntityQR id={data.pcr.id} size={96} />
				<a href="/pcr/{data.pcr.id}/edit" class="hidden sm:inline-flex write-only px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Edit</a>
			</div>
		</div>
	</div>

	<div class="rounded-lg border border-slate-800 p-5">
		<dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
			{#each [
				['Well', data.pcr.well_label, undefined],
				['Target Gene', data.pcr.target_gene, 'target_gene'],
				['Region', data.pcr.target_subfragment, 'target_subfragment'],
				['Forward Primer', data.pcr.forward_primer_name ? `${data.pcr.forward_primer_name} (${data.pcr.forward_primer_seq})` : data.pcr.forward_primer_seq, undefined],
				['Reverse Primer', data.pcr.reverse_primer_name ? `${data.pcr.reverse_primer_name} (${data.pcr.reverse_primer_seq})` : data.pcr.reverse_primer_seq, undefined],
				['Annealing Temp', data.pcr.annealing_temp_c != null ? `${data.pcr.annealing_temp_c}°C` : null, undefined],
				['Cycles', data.pcr.num_cycles, undefined],
				['Concentration', data.pcr.concentration_ng_ul != null ? `${data.pcr.concentration_ng_ul} ng/µL` : null, undefined],
				['Volume', data.pcr.total_volume_ul != null ? `${data.pcr.total_volume_ul} µL` : null, undefined],
				['260/280', data.pcr.a260_280, undefined],
				['260/230', data.pcr.a260_230, undefined],
				['Quantification', data.pcr.quantification_method, undefined],
				['Band', data.pcr.band_observed != null ? (data.pcr.band_observed ? 'Yes' : 'No') : null, undefined],
				['Date', data.pcr.pcr_date, undefined]
			] as [label, value, slot]}
				{#if value != null}
				<div class="flex justify-between py-1 border-b border-slate-800/50">
					<dt class="text-slate-400">
						{#if slot}<GlossaryDoc {slot} {label} />{:else}{label}{/if}
					</dt>
					<dd class="text-slate-200">{value}</dd>
				</div>
				{/if}
			{/each}
		</dl>
	</div>

	{#if data.pcr.notes}<div class="rounded-lg border border-slate-800 p-5"><h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-2">Notes</h2><p class="text-sm text-slate-300">{data.pcr.notes}</p></div>{/if}

	<div>
		<div class="flex items-center justify-between mb-3">
			<h2 class="text-lg font-semibold text-white">Library Preps ({data.libraries.length})</h2>
			<a href="/libraries/new?pcr_id={data.pcr.id}" class="hidden sm:inline-flex write-only px-3 py-1.5 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">Add Library</a>
		</div>
		<DataTable columns={libColumns} rows={data.libraries} href={(row) => `/libraries/${row.id}`} empty="No library preps yet." />
	</div>
	{/if}
</div>
