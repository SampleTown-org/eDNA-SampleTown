<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import AccessionLink from '$lib/components/AccessionLink.svelte';
	import GlossaryDoc from '$lib/components/GlossaryDoc.svelte';
	import EntityQR from '$lib/components/EntityQR.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	const crumbs = $derived.by(() => {
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
		if (data.plate) {
			c.push({ label: (data.plate as any).plate_name, href: `/libraries/${(data.plate as any).id}` });
		}
		c.push({ label: (data.library as any).library_name });
		return c;
	});

	/** Last path segment — the filename a reader recognises. The full path
	 *  stays reachable as the link target. */
	function fileName(path: unknown): string | null {
		if (!path) return null;
		const s = String(path).replace(/\/+$/, '');
		const cut = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
		return cut >= 0 ? s.slice(cut + 1) : s;
	}

	/** Only a URL can be opened from the browser. A path on a lab server is
	 *  shown but not linked — SampleTown cannot reach it. */
	function fileHref(path: unknown): string | null {
		const s = path ? String(path) : '';
		return /^https?:\/\/|^ftp:\/\//i.test(s) ? s : null;
	}

	const runs = $derived(
		(data.runs as any[]).map((r) => ({
			...r,
			r1: fileName(r.fastq_r1 ?? r.fastq_single),
			r2: fileName(r.fastq_r2),
			reads: r.read_count?.toLocaleString() ?? null
		}))
	);
	const hasFiles = $derived(runs.some((r: any) => r.r1 || r.r2));

	const runColumns = $derived([
		{ key: 'run_name', label: 'Run', sortable: true },
		{ key: 'platform', label: 'Platform', sortable: true },
		{ key: 'run_date', label: 'Date', sortable: true },
		...(hasFiles
			? [
					{ key: 'reads', label: 'Reads', sortable: true },
					{
						key: 'r1',
						label: 'Reads R1',
						sortable: true,
						href: (row: any) => fileHref(row.fastq_r1 ?? row.fastq_single),
						external: true
					},
					{
						key: 'r2',
						label: 'Reads R2',
						sortable: true,
						href: (row: any) => fileHref(row.fastq_r2),
						external: true
					}
				]
			: [])
	]);

	const fields: Array<[string, unknown, string?]> = [
		['Well', data.library.well_label],
		['Type', data.library.library_type],
		['Platform', data.library.platform],
		['Instrument', data.library.instrument_model],
		['Prep Kit', data.library.library_prep_kit, 'library_prep_kit'],
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
		<div class="flex items-start justify-between gap-4">
			<div>
				<h1 class="text-2xl font-bold text-white">{data.library.library_name}</h1>
				<AccessionLink accession={(data.library as any).accession} class="mt-1" />
				<Breadcrumb items={crumbs} />
			</div>
			<EntityQR id={data.library.id} size={96} />
		</div>
	</div>

	<div class="rounded-lg border border-slate-800 p-5">
		<dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
			{#each fields as [label, value, slot]}
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
		<DataTable columns={runColumns} rows={runs} href={(row) => `/runs/${row.id}`} empty="Not yet sequenced." />
	</div>
</div>
