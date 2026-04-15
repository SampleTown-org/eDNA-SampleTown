<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import PeopleRoster from '$lib/components/PeopleRoster.svelte';
	import GlossaryDoc from '$lib/components/GlossaryDoc.svelte';
	import EntityQR from '$lib/components/EntityQR.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import { detectPlateFormat, downloadTSV, openPrintWindow, type PrintCell } from '$lib/plate-export';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	function exportPlateTSV() {
		const plate = data.plate as any;
		const libs = (data.libraries ?? []) as any[];
		downloadTSV(
			`${plate.plate_name}.tsv`,
			['Well', 'Library Name', 'Source Type', 'Source Name', 'i7 Index', 'i5 Index', 'Barcode', 'Conc. ng/µL'],
			libs.map((l) => [
				l.well_label ?? '',
				l.library_name ?? '',
				l.source_type ?? '',
				l.source_name ?? '',
				l.index_sequence_i7 ?? '',
				l.index_sequence_i5 ?? '',
				l.barcode ?? '',
				l.final_concentration_ng_ul ?? ''
			])
		);
	}

	function printPlateLayout() {
		const plate = data.plate as any;
		const libs = (data.libraries ?? []) as any[];
		const wellMap: Record<string, PrintCell> = {};
		for (const l of libs) {
			if (!l.well_label) continue;
			wellMap[l.well_label] = { primary: l.library_name ?? '', secondary: l.source_name ?? '' };
		}
		const format = detectPlateFormat(libs.map((l) => l.well_label));
		const subtitle = [plate.library_type, plate.library_prep_date, `${libs.length} libraries`]
			.filter(Boolean).join(' · ');
		openPrintWindow({ title: plate.plate_name, subtitle, format, wellMap });
	}

	const crumbs = $derived.by(() => {
		if (data.type === 'plate') {
			return [
				{ label: data.lab?.name ?? 'Lab', href: '/' },
				{ label: 'Library Plates', href: '/libraries' },
				{ label: (data.plate as any).plate_name }
			];
		}
		const c: { label: string; href?: string }[] = [
			{ label: data.lab?.name ?? 'Lab', href: '/' }
		];
		const s = data.source as any;
		if (s?.project_id) {
			c.push({ label: 'Projects', href: '/projects' });
			c.push({ label: s.project_name, href: `/projects/${s.project_id}` });
			c.push({ label: 'Sites', href: '/sites' });
			c.push({ label: s.site_name, href: `/sites/${s.site_id}` });
			c.push({ label: 'Samples', href: '/samples' });
			c.push({ label: s.sample_name, href: `/samples/${s.sample_id}` });
			c.push({ label: 'Extracts', href: '/extracts' });
			if (s.extract_name) {
				c.push({ label: s.extract_name, href: `/extracts/${s.extract_id}` });
			}
			if (s.type === 'PCR') c.push({ label: s.name, href: `/pcr/reaction/${s.id}` });
		} else {
			c.push({ label: 'Libraries', href: '/libraries' });
		}
		c.push({ label: (data.library as any).library_name });
		return c;
	});

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
		<div class="flex items-start justify-between gap-4">
			<div>
				<div class="flex items-center gap-3 flex-wrap">
					<h1 class="text-2xl font-bold text-white">{data.plate.plate_name}</h1>
					<span class="px-2 py-0.5 text-xs rounded bg-slate-800 text-slate-300">{data.plate.library_type}</span>
				</div>
				<Breadcrumb items={crumbs} />
				{#if data.plate.pcr_plate_name}
					<p class="text-sm text-slate-400 mt-1">From PCR Plate: <a href="/pcr/{data.plate.pcr_plate_id}" class="text-ocean-400 hover:text-ocean-300">{data.plate.pcr_plate_name}</a></p>
				{/if}
			</div>
			<div class="flex items-center gap-3 shrink-0">
				<EntityQR id={data.plate.id} size={96} />
				<button onclick={exportPlateTSV} class="hidden sm:inline-flex px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium" title="Download plate layout + per-library details as TSV">TSV</button>
				<button onclick={printPlateLayout} class="hidden sm:inline-flex px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium" title="Open a print-friendly plate layout (use browser print dialog → Save as PDF)">Print</button>
				<a href="/libraries/{data.plate.id}/edit" class="hidden sm:inline-flex write-only px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Edit</a>
			</div>
		</div>
	</div>

	<div class="rounded-lg border border-slate-800 p-5">
		<dl class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-2 text-sm">
			{#each [
				['Type', data.plate.library_type, undefined],
				['Platform', data.plate.platform, undefined],
				['Instrument', data.plate.instrument_model, undefined],
				['Prep Kit', data.plate.library_prep_kit, 'library_prep_kit'],
				['Fragment Size', data.plate.fragment_size_bp != null ? `${data.plate.fragment_size_bp} bp` : null, undefined],
				['Prep Date', data.plate.library_prep_date, undefined]
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
		<Breadcrumb items={crumbs} />
		<div class="flex items-start justify-between mt-1 gap-4">
			<h1 class="text-2xl font-bold text-white">{data.library.library_name}</h1>
			<div class="flex items-center gap-3 shrink-0">
				<EntityQR id={data.library.id} size={96} />
				<a href="/libraries/{data.library.id}/edit" class="hidden sm:inline-flex write-only px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Edit</a>
			</div>
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
				['Well', data.library.well_label, undefined],
				['Type', data.library.library_type, undefined],
				['Platform', data.library.platform, undefined],
				['Instrument', data.library.instrument_model, undefined],
				['Prep Kit', data.library.library_prep_kit, 'library_prep_kit'],
				['i7 Index', data.library.index_sequence_i7, undefined],
				['i5 Index', data.library.index_sequence_i5, undefined],
				['Barcode', data.library.barcode, undefined],
				['Fragment Size', data.library.fragment_size_bp != null ? `${data.library.fragment_size_bp} bp` : null, undefined],
				['Concentration', data.library.final_concentration_ng_ul != null ? `${data.library.final_concentration_ng_ul} ng/µL` : null, undefined],
				['Prep Date', data.library.library_prep_date, undefined]
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

	<div>
		<h2 class="text-lg font-semibold text-white mb-3">Sequencing Runs ({data.runs.length})</h2>
		<DataTable columns={runColumns} rows={data.runs} href={(row) => `/runs/${row.id}`} empty="Not yet sequenced." />
	</div>
{/if}
</div>
