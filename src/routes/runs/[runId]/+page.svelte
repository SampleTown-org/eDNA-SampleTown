<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import PeopleRoster from '$lib/components/PeopleRoster.svelte';
	import EntityQR from '$lib/components/EntityQR.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	const crumbs = $derived([
		{ label: data.lab?.name ?? 'Lab', href: '/' },
		{ label: 'Sequencing Runs', href: '/runs' },
		{ label: (data.run as any).run_name }
	]);

	/** Last path segment of a URL or filesystem path — the filename a reader
	 *  recognises, where the full path is unreadable at table width. The whole
	 *  path stays reachable as the link target. */
	function fileName(path: unknown): string | null {
		if (!path) return null;
		const s = String(path).replace(/\/+$/, '');
		const cut = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
		return cut >= 0 ? s.slice(cut + 1) : s;
	}

	/** Bytes as the size a reader would quote. */
	function fileSize(bytes: unknown): string | null {
		const n = Number(bytes);
		if (!Number.isFinite(n) || n <= 0) return null;
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		let v = n;
		let u = 0;
		while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
		return `${v < 10 && u > 0 ? v.toFixed(1) : Math.round(v)} ${units[u]}`;
	}

	/** Only a URL can be opened from the browser. A recorded filesystem path on
	 *  a lab server is shown, and is copyable, but is not a link — SampleTown
	 *  cannot reach it and a dead link would imply otherwise. */
	function fileHref(path: unknown): string | null {
		const s = path ? String(path) : '';
		return /^https?:\/\/|^ftp:\/\//i.test(s) ? s : null;
	}

	const libraries = $derived(
		(data.libraries as any[]).map((l) => ({
			...l,
			r1: fileName(l.fastq_r1 ?? l.fastq_single),
			r2: fileName(l.fastq_r2),
			reads: l.read_count?.toLocaleString() ?? null,
			size: fileSize(l.fastq_bytes)
		}))
	);
	/** True once any library on this run has files recorded — the columns are
	 *  only worth their width when something fills them. */
	const hasFiles = $derived(libraries.some((l: any) => l.r1 || l.r2));

	const libColumns = $derived([
		{ key: 'library_name', label: 'Library', sortable: true },
		{ key: 'library_type', label: 'Type', sortable: true },
		{ key: 'platform', label: 'Platform', sortable: true },
		...(hasFiles
			? [
					{ key: 'reads', label: 'Reads', sortable: true },
					{ key: 'size', label: 'Size', sortable: true },
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
	const analysisColumns = [
		{ key: 'pipeline', label: 'Pipeline', sortable: true },
		{ key: 'pipeline_profile', label: 'Profile', sortable: true },
		{ key: 'status', label: 'Status', sortable: true },
		{ key: 'launched_at', label: 'Launched', sortable: true }
	];

	const fields = [
		['Platform', data.run.platform],
		['Instrument', data.run.instrument_model],
		['Flow Cell', data.run.flow_cell_id],
		['FASTQ Dir', data.run.fastq_directory],
		['Total Reads', data.run.total_reads?.toLocaleString()],
		['Total Bases', data.run.total_bases?.toLocaleString()],
		['Run Date', data.run.run_date]
	];
</script>

<div class="space-y-6">
	<div>
		<div class="flex items-start justify-between gap-4">
			<div>
				<h1 class="text-2xl font-bold text-white">{data.run.run_name}</h1>
					{#if (data.run as any).accession}
						<!-- INSDC accession this record was imported under. Absent for
						     records entered by hand, which have never been submitted. -->
						<a href="https://www.ebi.ac.uk/ena/browser/view/{(data.run as any).accession}"
							target="_blank" rel="noopener noreferrer"
							class="inline-block mt-1 font-mono text-xs text-ocean-400 hover:text-ocean-300"
							title="View at ENA">{(data.run as any).accession} ↗</a>
					{/if}
				<Breadcrumb items={crumbs} />
			</div>
			<div class="flex items-center gap-3 shrink-0">
				<EntityQR id={data.run.id} size={96} />
				<a href="/runs/{data.run.id}/edit" class="hidden sm:inline-flex write-only px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Edit</a>
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

	{#if data.people.length > 0}
		<div class="rounded-lg border border-slate-800 p-5 space-y-3">
			<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">People</h2>
			<PeopleRoster people={data.people} />
		</div>
	{/if}

	<div>
		<h2 class="text-lg font-semibold text-white mb-3">Libraries ({data.libraries.length})</h2>
		<DataTable columns={libColumns} rows={libraries} href={(row) => `/libraries/${row.id}`} empty="No libraries attached." />
	</div>

	<div>
		<h2 class="text-lg font-semibold text-white mb-3">Analyses ({data.analyses.length})</h2>
		<DataTable columns={analysisColumns} rows={data.analyses} href={(row) => `/analysis/${row.id}`} empty="No analyses yet." />
	</div>
</div>
