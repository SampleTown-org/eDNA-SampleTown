<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import EntityQR from '$lib/components/EntityQR.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	const crumbs = $derived.by(() => {
		const c: { label: string; href?: string }[] = [
			{ label: data.lab?.name ?? 'Lab', href: '/' },
			{ label: 'Projects', href: '/projects' },
			{ label: (data.pcr as any).project_name, href: `/projects/${(data.pcr as any).project_id}` },
			{ label: 'Sites', href: '/sites' },
			{ label: (data.pcr as any).site_name, href: `/sites/${(data.pcr as any).site_id}` },
			{ label: 'Samples', href: '/samples' },
			{ label: (data.pcr as any).samp_name, href: `/samples/${(data.pcr as any).sample_id}` },
			{ label: 'Extracts', href: '/extracts' },
			{ label: (data.pcr as any).extract_name, href: `/extracts/${(data.pcr as any).extract_id}` }
		];
		if ((data.pcr as any).plate_id) {
			c.push({ label: (data.pcr as any).plate_name, href: `/pcr/${(data.pcr as any).plate_id}` });
		}
		c.push({ label: (data.pcr as any).pcr_name });
		return c;
	});

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
		['Concentration', data.pcr.concentration_ng_ul != null ? `${data.pcr.concentration_ng_ul} ng/µL` : null],
		['Volume', data.pcr.total_volume_ul != null ? `${data.pcr.total_volume_ul} µL` : null],
		['260/280', data.pcr.a260_280],
		['260/230', data.pcr.a260_230],
		['Quantification', data.pcr.quantification_method],
		['Band', data.pcr.band_observed != null ? (data.pcr.band_observed ? 'Yes' : 'No') : null],
		['Date', data.pcr.pcr_date]
	];
</script>

<div class="space-y-6">
	<div>
		<div class="flex items-start justify-between gap-4">
			<div>
				<h1 class="text-2xl font-bold text-white">{data.pcr.pcr_name}</h1>
				<Breadcrumb items={crumbs} />
			</div>
			<div class="flex items-center gap-3 shrink-0">
				<EntityQR id={data.pcr.id} size={96} />
				<a href="/pcr/{data.pcr.id}/edit" class="hidden sm:inline-flex write-only px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Edit</a>
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

	{#if data.pcr.notes}<div class="rounded-lg border border-slate-800 p-5"><h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-2">Notes</h2><p class="text-sm text-slate-300">{data.pcr.notes}</p></div>{/if}

	<div>
		<div class="flex items-center justify-between mb-3">
			<h2 class="text-lg font-semibold text-white">Library Preps ({data.libraries.length})</h2>
			<a href="/libraries/new?pcr_id={data.pcr.id}" class="hidden sm:inline-flex write-only px-3 py-1.5 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">Add Library</a>
		</div>
		<DataTable columns={libColumns} rows={data.libraries} href={(row) => `/libraries/${row.id}`} empty="No library preps yet." />
	</div>
</div>
