<script lang="ts">
	import type { PageData } from './$types';
	import PeoplePicker from '$lib/components/PeoplePicker.svelte';
	import { CHECKLIST_OPTIONS, EXTENSION_OPTIONS } from '$lib/mixs/checklists';
	import { MIXS_ACTIVE_VERSION } from '$lib/mixs/schema-index';
	import { sortAndLabelTsv } from '$lib/mixs/tsv';
	import { INSDC_FETCH_TIMEOUT_MS } from '$lib/insdc-limits';

	let { data }: { data: PageData } = $props();

	// People to apply to every imported sample
	let importPeople = $state<{ personnel_id: string; role?: string | null }[]>([]);

	let mode = $state<'export' | 'import'>('export');

	// --- Export ---
	let exportProject = $state('');
	let exportChecklist = $state('MimarksS');
	let exportExtension = $state('Water');
	let previewTsv = $state('');
	let previewRows = $state(0);
	let exporting = $state(false);
	let previewLines = $derived(previewTsv ? previewTsv.trim().split('\n') : []);

	async function previewExport() {
		exporting = true;
		const params = new URLSearchParams({ format: 'preview' });
		if (exportProject) params.set('project_id', exportProject);
		if (exportChecklist) params.set('checklist', exportChecklist);
		if (exportExtension) params.set('extension', exportExtension);
		const res = await fetch(`/api/export/mixs?${params}`);
		if (res.ok) {
			const data = await res.json();
			previewTsv = data.tsv;
			previewRows = data.tsv.trim().split('\n').length - 1;
		}
		exporting = false;
	}

	function downloadExport() {
		const params = new URLSearchParams();
		if (exportProject) params.set('project_id', exportProject);
		if (exportChecklist) params.set('checklist', exportChecklist);
		if (exportExtension) params.set('extension', exportExtension);
		window.location.href = `/api/export/mixs?${params}`;
	}

	// --- MIxS template download (import side) ---
	let templateChecklist = $state('MimarksS');
	let templateExtension = $state('Water');
	let templateUrl = $derived(
		`/api/mixs/template?checklist=${templateChecklist}${templateExtension ? '&extension=' + templateExtension : ''}`
	);

	// --- Import ---
	/** Where the rows come from: an uploaded sheet, or a fetch from the sequence
	 *  archives. Both produce a TSV that goes through /api/import/mixs, so
	 *  everything below this point — preview, mapper, validation — is shared.
	 *  'template' is the odd one out: a download-only view for starting a sheet
	 *  from an empty MIxS checklist. */
	let importSource = $state<'file' | 'accession' | 'template'>('file');
	let importProject = $state('');
	let importTsv = $state('');
	let importFileName = $state('');

	// --- Archive fetch (SRA / ENA / GenBank) ---
	let accessions = $state('');
	let fetching = $state(false);
	type Resolved = { accession: string; kind: string; source: string; rows: number };
	let fetchResult = $state<{ count: number; warnings: string[]; resolved: Resolved[] } | null>(null);
	let fetchError = $state('');
	let siteMatchKm = $state(1);
	/** Import samples that have no coordinates by putting them on a site named
	 *  for whatever locality the sheet does carry. On by default — archives omit
	 *  coordinates routinely, and dropping those rows loses the controls and
	 *  blanks that make the rest of a run interpretable. */
	let allowSitesWithoutCoords = $state(true);
	/** Default MIxS checklist + extension applied to rows whose TSV doesn't
	 *  carry mixs_checklist / extension columns. Drives import-side validation
	 *  and the default combination class for required-slot resolution. */
	let importChecklist = $state('MimarksS');
	let importExtension = $state('Water');
	type SiteMatch = { samp_name: string; new_site: boolean; site: { id: string; site_name: string; distance_km: number } | null };
	type NewSite = { id: string; site_name: string; lat_lon: string; geo_loc_name: string | null };
	type NewProject = { id: string; project_name: string };
	type PcrPreview = {
		samp_name: string;
		pcr_name: string;
		pcr_date: string | null;
		target_gene: string | null;
		target_subfragment: string | null;
		forward_primer_name: string | null;
		reverse_primer_name: string | null;
	};
	type ExtractPreview = {
		samp_name: string;
		extract_name: string;
		extraction_date: string | null;
		concentration_ng_ul: number | null;
		storage_box: string | null;
		storage_location: string | null;
	};
	type LibraryPreview = {
		samp_name: string;
		library_name: string;
		library_barcode: string | null;
		library_platform: string | null;
		library_concentration_ng_ul: number | null;
		run_name: string | null;
	};
	type NewRun = {
		id: string;
		run_name: string;
		run_date: string | null;
		run_platform: string | null;
		run_flow_cell_id: string | null;
	};
	type MixsRowValidation = {
		samp_name: string;
		checklist: string;
		extension: string | null;
		errors: { slot: string; message: string; keyword: string }[];
	};
	let importPreview: {
		samples: any[];
		errors: string[];
		headers: string[];
		count: number;
		site_matches?: SiteMatch[];
		new_sites?: NewSite[];
		new_projects?: NewProject[];
		extracts?: ExtractPreview[];
		pcrs?: PcrPreview[];
		libraries?: LibraryPreview[];
		new_runs?: NewRun[];
		column_map?: Record<string, string>;
		available_fields?: { value: string; table: string; title?: string; local?: true }[];
		site_fields?: string[];
		mixs_validation?: MixsRowValidation[];
	} | null = $state(null);

	/** Quick lookup: target value → owning table for the → tab column. */
	let targetTable = $derived.by(() => {
		const m = new Map<string, string>();
		for (const f of importPreview?.available_fields ?? []) m.set(f.value, f.table);
		return m;
	});

	/** Resolve what "→ <tab>" to show for a given target value, handling
	 *  misc_param:* tags (always → sample) and skip/blank. */
	function tabFor(target: string | undefined): string {
		if (!target || target === '_skip_') return '';
		if (target.startsWith('misc_param:')) return 'sample (custom tag)';
		return targetTable.get(target) ?? 'sample (unknown — will spill)';
	}
	let importing = $state(false);
	let importResult: { rows?: number; imported: number; errors: string[]; site_matches?: number; new_sites?: number; new_projects?: number; extracts_created?: number; pcrs_created?: number; libraries_created?: number; runs_created?: number; run_libraries_created?: number } | null = $state(null);

	// Column mapper state — populated from the dry-run response and editable by the user.
	let columnMap = $state<Record<string, string>>({});
	let showMapper = $state(true);

	let importFile: File | null = $state(null);

	// Set of fields that belong to the sites table (for display in mapper)
	let siteFieldSet = $derived(new Set(importPreview?.site_fields ?? ['lat_lon', 'latitude', 'longitude', 'geo_loc_name', 'env_broad_scale', 'env_local_scale']));

	// Detect duplicate target fields — two columns mapped to the same field
	let duplicateTargets = $derived.by(() => {
		const seen = new Map<string, string[]>();
		for (const [header, field] of Object.entries(columnMap)) {
			if (!field || field === '_skip_' || field.startsWith('misc_param:')) continue;
			if (!seen.has(field)) seen.set(field, []);
			seen.get(field)!.push(header);
		}
		const dupes: { field: string; headers: string[] }[] = [];
		for (const [field, headers] of seen) {
			if (headers.length > 1) dupes.push({ field, headers });
		}
		return dupes;
	});
	let hasDuplicates = $derived(duplicateTargets.length > 0);

	function fieldLabel(field: string): string {
		if (!field || field === '_skip_') return field;
		return siteFieldSet.has(field) ? `site: ${field}` : `sample: ${field}`;
	}

	function handleFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		importFile = file;
		importFileName = file.name;
		importPreview = null;
		importResult = null;

		// For TSV/CSV, also read as text for the JSON API path
		if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
			const reader = new FileReader();
			reader.onload = () => { importTsv = reader.result as string; };
			reader.readAsText(file);
		} else {
			importTsv = ''; // xlsx handled server-side
		}
	}

	/** "1 new project", not "1 new projects" — the summary line reads as prose. */
	function plural(n: number, one: string, many = `${one}s`): string {
		return `${n} ${n === 1 ? one : many}`;
	}

	/**
	 * Time left before the fetch times out, counted down while it runs.
	 *
	 * The number is the server's own deadline, not a guess at how long the
	 * archives will take: a fetch of one BioSample returns in a second and
	 * leaves most of it on the clock. What it answers is "how long could this
	 * still go on for", which is the question someone watching a spinner has.
	 */
	let fetchRemainingMs = $state(0);
	let countdownTimer: ReturnType<typeof setInterval> | undefined;

	const fetchCountdown = $derived.by(() => {
		const total = Math.ceil(fetchRemainingMs / 1000);
		return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
	});

	function startCountdown() {
		const endsAt = Date.now() + INSDC_FETCH_TIMEOUT_MS;
		fetchRemainingMs = INSDC_FETCH_TIMEOUT_MS;
		clearInterval(countdownTimer);
		countdownTimer = setInterval(() => {
			fetchRemainingMs = Math.max(0, endsAt - Date.now());
			if (fetchRemainingMs === 0) clearInterval(countdownTimer);
		}, 1000);
	}

	function stopCountdown() {
		clearInterval(countdownTimer);
		countdownTimer = undefined;
		fetchRemainingMs = 0;
	}

	// A fetch left running when the operator navigates away would keep its
	// interval alive.
	$effect(() => () => clearInterval(countdownTimer));

	/** Pull metadata for the pasted accessions and hand the resulting TSV to the
	 *  same preview path an uploaded file takes. */
	async function fetchAccessions() {
		if (!accessions.trim()) return;
		fetching = true;
		startCountdown();
		fetchError = '';
		fetchResult = null;
		importPreview = null;
		importResult = null;
		importFile = null;
		importTsv = '';

		// The server stops at the same deadline and answers with whatever it
		// retrieved; this is the backstop for a reply that never arrives at all.
		// The grace period lets that fuller answer win the race.
		let res: Response;
		try {
			res = await fetch('/api/import/insdc', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ accessions }),
				signal: AbortSignal.timeout(INSDC_FETCH_TIMEOUT_MS + 15_000)
			});
		} catch (err) {
			fetchError =
				err instanceof DOMException && err.name === 'TimeoutError'
					? `The archives did not answer within ${Math.round(INSDC_FETCH_TIMEOUT_MS / 60_000)} minutes. Try fewer accessions at once.`
					: `Lookup failed: ${err instanceof Error ? err.message : String(err)}`;
			fetching = false;
			stopCountdown();
			return;
		}
		const body = await res.json().catch(() => null);

		if (!res.ok) {
			fetchError = body?.error || `Lookup failed (HTTP ${res.status})`;
		} else if (!body.tsv) {
			fetchError = 'No records found for those accessions.';
			fetchResult = { count: 0, warnings: body.warnings ?? [], resolved: body.resolved ?? [] };
		} else {
			importTsv = body.tsv;
			importFileName = `${body.count} record(s) from ${body.resolved.length} accession(s)`;
			fetchResult = { count: body.count, warnings: body.warnings ?? [], resolved: body.resolved ?? [] };
			await previewImport();
		}
		fetching = false;
		stopCountdown();
	}

	/** True once there are rows to validate, whichever source produced them. */
	let hasImportRows = $derived(importSource === 'file' ? !!importFile : !!importTsv);

	async function sendImport(dryRun: boolean, useMapping: boolean = false) {
		// importProject is optional: sheets with a project_name column auto-resolve
		// per row (and can create new projects). The server 400s if neither source
		// is present.
		if (!hasImportRows) return;
		importing = true;

		const colMapJson = useMapping && Object.keys(columnMap).length > 0 ? JSON.stringify(columnMap) : null;

		let res: Response;
		if (importFile && (importFile.name.endsWith('.xlsx') || importFile.name.endsWith('.xls'))) {
			const fd = new FormData();
			fd.append('file', importFile);
			if (importProject) fd.append('projectId', importProject);
			fd.append('dryRun', String(dryRun));
			fd.append('siteMatchKm', String(siteMatchKm));
			fd.append('allowSitesWithoutCoords', String(allowSitesWithoutCoords));
			fd.append('defaultChecklist', importChecklist);
			if (importExtension) fd.append('defaultExtension', importExtension);
			if (colMapJson) fd.append('columnMap', colMapJson);
			if (!dryRun && importPeople.length > 0) fd.append('people', JSON.stringify(importPeople));
			res = await fetch('/api/import/mixs', { method: 'POST', body: fd });
		} else {
			res = await fetch('/api/import/mixs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					tsv: importTsv,
					projectId: importProject || undefined,
					dryRun,
					siteMatchKm,
					allowSitesWithoutCoords,
					defaultChecklist: importChecklist,
					defaultExtension: importExtension || undefined,
					columnMap: colMapJson ? JSON.parse(colMapJson) : undefined,
					people: !dryRun && importPeople.length > 0 ? importPeople : undefined
				})
			});
		}

		if (dryRun) {
			if (res.ok) {
				importPreview = await res.json();
				// Seed the editable map from the server's detected mapping on the FIRST
				// dry run (before the user has edited anything), otherwise keep the
				// user's edits.
				if (!useMapping && importPreview?.column_map) {
					columnMap = { ...importPreview.column_map };
				}
			} else {
				const err = await res.json().catch(() => null);
				importPreview = { samples: [], errors: [err?.error || 'Parse failed'], headers: [], count: 0 };
			}
		} else {
			if (res.ok) {
				importResult = await res.json();
				importPreview = null;
				showMapper = false;
			} else {
				const err = await res.json().catch(() => null);
				importResult = { imported: 0, errors: [err?.error || 'Import failed'] };
			}
		}
		importing = false;
	}

	/** Filename for the exported TSV, named after wherever the rows came from. */
	function tsvFileName(): string {
		if (importSource === 'accession') {
			const first = accessions.trim().split(/[\s,;]+/)[0];
			return first ? `sampletown_${first}.tsv` : 'sampletown_import.tsv';
		}
		const base = importFileName.replace(/\.(xlsx|xls|csv|tsv|txt)$/i, '');
		return base ? `${base}.tsv` : 'sampletown_import.tsv';
	}

	/**
	 * How a column was named at its source.
	 *
	 * A sheet on disk is quoted verbatim — it is the operator's own file and
	 * they should recognise it. Rows fetched from an archive have no file: the
	 * `misc_param:` prefix on an off-schema column is SampleTown's routing
	 * decision, so the archive's bare field name is what actually arrived.
	 */
	function sourceColumn(header: string): string {
		if (importSource !== 'accession') return header;
		return header.startsWith('misc_param:') ? header.slice('misc_param:'.length) : header;
	}

	/** SampleTown's own importable columns — the auto-create chain and the
	 *  site/project lookups. Offered on a downloaded sheet so a hand edit can
	 *  fill them in. */
	const offeredColumns = $derived.by(() => {
		const fields = importPreview?.available_fields ?? [];
		return fields.filter((f) => f.local).map((f) => f.value);
	});

	/** Download the rows as they stand.
	 *
	 *  The preview is read-only, so a bad cell is corrected by editing the sheet
	 *  and importing it again. Rows fetched from an accession have no file on
	 *  disk to edit, which otherwise leaves no way to fix them at all. */
	function downloadTsv() {
		if (!importTsv) return;
		// Grouped by vocabulary and labelled, the same shape the Export tab
		// produces — one app should not hand out two differently-shaped sheets.
		// SampleTown's own columns are appended empty: an archive sheet carries
		// none of the lab's own work, and the sheet is the only place an
		// operator finds out which columns would create an extract, a PCR, a
		// library or a run.
		const blob = new Blob([sortAndLabelTsv(importTsv, offeredColumns)], {
			type: 'text/tab-separated-values'
		});
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = tsvFileName();
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}

	async function previewImport() { await sendImport(true, false); }
	async function revalidateWithMapping() { await sendImport(true, true); }
	async function runImport() { await sendImport(false, true); }

	const selectCls = 'px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500';
</script>

<div class="max-w-5xl space-y-6">
	<h1 class="text-2xl font-bold text-white">Import / Export</h1>

	<div class="flex gap-1 p-1 bg-slate-800 rounded-lg w-fit">
		<button onclick={() => mode = 'export'} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {mode === 'export' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">Export</button>
		<button onclick={() => mode = 'import'} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {mode === 'import' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">Import</button>
	</div>

	{#if mode === 'export'}
	<div class="space-y-4">
		<p class="text-sm text-slate-400">Export samples as MIxS-compliant TSV for NCBI BioSample / SRA submission.</p>

		<div class="flex gap-4 items-end flex-wrap">
			<div>
				<label class="block text-xs font-medium text-slate-400 mb-1">Project</label>
				<select bind:value={exportProject} class={selectCls}>
					<option value="">All projects</option>
					{#each data.projects as p}<option value={p.id}>{p.project_name}</option>{/each}
				</select>
			</div>
			<div>
				<label class="block text-xs font-medium text-slate-400 mb-1">Checklist</label>
				<select bind:value={exportChecklist} class={selectCls}>
					{#each CHECKLIST_OPTIONS as c}<option value={c.value}>{c.label}</option>{/each}
				</select>
			</div>
			<div>
				<label class="block text-xs font-medium text-slate-400 mb-1">Extension</label>
				<select bind:value={exportExtension} class={selectCls}>
					<option value="">(none)</option>
					{#each EXTENSION_OPTIONS as e}<option value={e.value}>{e.label}</option>{/each}
				</select>
			</div>
			<button onclick={previewExport} disabled={exporting} class="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:opacity-50 transition-colors text-sm font-medium">
				{exporting ? 'Loading...' : 'Preview'}
			</button>
			<button onclick={downloadExport} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">
				Download TSV
			</button>
		</div>

		<p class="text-xs text-slate-500">{data.sampleCount} total samples</p>

		{#if previewTsv}
		<div class="space-y-2">
			<p class="text-sm text-slate-300">{previewRows} samples in export</p>
			<div class="overflow-x-auto max-h-96 overflow-y-auto rounded-lg border border-slate-800">
				<table class="text-xs">
					<thead class="sticky top-0">
						<tr class="bg-slate-900">
							{#each previewLines[0]?.split('\t') ?? [] as header}
								<th class="px-2 py-1.5 text-left font-medium text-slate-400 whitespace-nowrap border-b border-slate-700">{header}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each previewLines.slice(1, 51) as line, i}
						<tr class="border-b border-slate-800/30 {i % 2 ? 'bg-slate-900/30' : ''}">
							{#each line.split('\t') as cell}
								<td class="px-2 py-1 text-slate-300 whitespace-nowrap max-w-48 truncate">{cell}</td>
							{/each}
						</tr>
						{/each}
					</tbody>
				</table>
			</div>
			{#if previewRows > 50}<p class="text-xs text-slate-500">Showing first 50 of {previewRows} rows</p>{/if}
		</div>
		{/if}
	</div>

	{:else}
	<!-- Import -->
	<div class="space-y-4">
		<p class="text-sm text-slate-400">Import samples from a MIxS-compliant sheet, or straight from SRA / ENA / GenBank by accession. Sites are auto-created or matched by proximity.</p>

		<div class="flex gap-1 p-1 bg-slate-800 rounded-lg w-fit">
			<button onclick={() => importSource = 'file'} class="px-3 py-1 rounded text-xs font-medium transition-colors {importSource === 'file' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}">Upload file</button>
			<button onclick={() => importSource = 'accession'} class="px-3 py-1 rounded text-xs font-medium transition-colors {importSource === 'accession' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}">From accession</button>
			<button onclick={() => importSource = 'template'} class="px-3 py-1 rounded text-xs font-medium transition-colors {importSource === 'template' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}">Templates</button>
		</div>

		{#if importSource === 'accession'}
		<div class="space-y-2 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
			<label for="accessions" class="block text-xs font-medium text-slate-400">
				INSDC accessions
			</label>
			<textarea
				id="accessions"
				bind:value={accessions}
				rows="2"
				placeholder="PRJNA644656  SAMN15515801  ERR2683149  MZ477765"
				class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-ocean-500"
			></textarea>
			<div class="flex items-center gap-3 flex-wrap">
				<button onclick={fetchAccessions} disabled={fetching || !accessions.trim()}
					class="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:opacity-50 transition-colors text-sm font-medium">
					{fetching ? 'Fetching...' : 'Fetch metadata'}
				</button>
				{#if fetching}
					<span class="text-xs text-slate-400 tabular-nums" aria-live="polite">
						{#if fetchRemainingMs > 0}
							timeout in {fetchCountdown}
						{:else}
							finishing up…
						{/if}
					</span>
				{/if}
				<p class="text-[11px] text-slate-500">
					BioProject → project · BioSample → sample · Experiment → extract, PCR, library · Run → sequencing run.
					Separate accessions with spaces, commas, or newlines.
				</p>
			</div>

			{#if fetchError}
				<div class="px-3 py-2 rounded-lg text-sm bg-red-900/20 border border-red-800 text-red-300">{fetchError}</div>
			{/if}

			{#if fetchResult && fetchResult.resolved.length > 0}
				<table class="w-full text-xs">
					<thead>
						<tr class="text-slate-400 border-b border-slate-800">
							<th class="px-2 py-1 text-left font-medium">Accession</th>
							<th class="px-2 py-1 text-left font-medium">Type</th>
							<th class="px-2 py-1 text-left font-medium">Source</th>
							<th class="px-2 py-1 text-right font-medium">Records</th>
						</tr>
					</thead>
					<tbody>
						{#each fetchResult.resolved as r (r.accession)}
						<tr class="border-b border-slate-800/30">
							<td class="px-2 py-1 font-mono text-slate-300">{r.accession}</td>
							<td class="px-2 py-1 text-slate-400">{r.kind}</td>
							<td class="px-2 py-1 text-slate-500">{r.source}</td>
							<td class="px-2 py-1 text-right {r.rows > 0 ? 'text-slate-300' : 'text-yellow-400'}">{r.rows}</td>
						</tr>
						{/each}
					</tbody>
				</table>
			{/if}

			{#if fetchResult && fetchResult.warnings.length > 0}
				<ul class="space-y-1 text-xs text-yellow-300/90 max-h-40 overflow-y-auto pr-1">
					{#each fetchResult.warnings as w}<li>· {w}</li>{/each}
				</ul>
			{/if}
		</div>
		{/if}

		{#if importSource === 'template'}
		<!-- MIxS v6.3 templates — generated from SampleTown's bundled LinkML
		     schema, so column headers exactly match what the import parser
		     recognizes. NCBI BioSample's public templates still lag at v6.0;
		     using our own generation keeps everything in sync. -->
		<div class="p-4 rounded-lg border border-slate-800 bg-slate-900/50 space-y-3">
			<h3 class="text-sm font-medium text-slate-300">MIxS v{MIXS_ACTIVE_VERSION} templates</h3>
			<p class="text-xs text-slate-500">
				Pick a checklist and extension to download an empty TSV with the exact columns that combination requires and recommends.
				Required parameters are prefixed with <code class="text-rose-400">*</code>. Fill in the file, save as TSV, and import above.
			</p>
			<div class="flex flex-wrap gap-2 items-end">
				<div>
					<label for="tmpl_checklist" class="block text-xs font-medium text-slate-400 mb-1">Checklist</label>
					<select id="tmpl_checklist" bind:value={templateChecklist} class={selectCls}>
						{#each CHECKLIST_OPTIONS as c}<option value={c.value}>{c.label}</option>{/each}
					</select>
				</div>
				<div>
					<label for="tmpl_extension" class="block text-xs font-medium text-slate-400 mb-1">Extension</label>
					<select id="tmpl_extension" bind:value={templateExtension} class={selectCls}>
						<option value="">(none)</option>
						{#each EXTENSION_OPTIONS as e}<option value={e.value}>{e.label}</option>{/each}
					</select>
				</div>
				<a href={templateUrl} download
					class="px-3 py-2 bg-ocean-700 hover:bg-ocean-600 text-white rounded-lg text-sm font-medium">
					Download TSV template
				</a>
			</div>
		</div>
		{/if}

		<!-- The templates tab is a download-only view; none of the import
		     controls below apply to it. -->
		{#if importSource !== 'template'}
		{#if importSource === 'file'}
		<div class="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
			<label for="import_file" class="block text-xs font-medium text-slate-400 mb-1">File (.xlsx, .tsv, .csv)</label>
			<input id="import_file" type="file" accept=".xlsx,.xls,.tsv,.txt,.csv" onchange={handleFile}
				class="text-sm text-slate-400 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-700 file:text-white file:text-sm file:cursor-pointer hover:file:bg-slate-600" />
		</div>
		{/if}

		<div class="flex gap-4 items-start flex-wrap">
			<div>
				<label class="block text-xs font-medium text-slate-400 mb-1">Import into existing project</label>
				<select bind:value={importProject} class={selectCls}>
					<option value="">New project</option>
					{#each data.projects as p}<option value={p.id}>{p.project_name}</option>{/each}
				</select>
				<p class="text-[10px] text-slate-500 mt-1">Optional if the sheet has a <code>project_name</code> column.</p>
			</div>
			<div>
				<label class="block text-xs font-medium text-slate-400 mb-1">Site match radius</label>
				<div class="flex items-center gap-2">
					<input type="range" min="0.001" max="10" step="0.001" bind:value={siteMatchKm}
						class="w-24 accent-ocean-500" />
					<input type="number" min="0.001" max="100" step="0.001" bind:value={siteMatchKm}
						class="w-20 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500" />
					<span class="text-xs text-slate-500">km</span>
				</div>
			</div>
		</div>

		<div class="flex gap-4 items-start flex-wrap">
			<div>
				<label class="block text-xs font-medium text-slate-400 mb-1">Checklist</label>
				<select bind:value={importChecklist} class={selectCls}>
					{#each CHECKLIST_OPTIONS as c}<option value={c.value}>{c.label}</option>{/each}
				</select>
			</div>
			<div>
				<label class="block text-xs font-medium text-slate-400 mb-1">Extension</label>
				<select bind:value={importExtension} class={selectCls}>
					<option value="">(none)</option>
					{#each EXTENSION_OPTIONS as e}<option value={e.value}>{e.label}</option>{/each}
				</select>
			</div>
		</div>
		<label class="flex items-start gap-2 text-xs text-slate-400 cursor-pointer w-fit">
			<input type="checkbox" bind:checked={allowSitesWithoutCoords}
				class="mt-0.5 accent-ocean-500" />
			<span>
				Create sites for samples without coordinates
				<span class="block text-slate-500">
					Groups them by <code>site_name</code>, <code>site_code</code>, or
					<code>geo_loc_name</code>, falling back to one “Location not recorded” site per
					project. Uncheck to skip those rows instead — every sample needs a site.
				</span>
			</span>
		</label>

		<p class="text-xs text-slate-500">
			Rows without <code>mixs_checklist</code> / <code>extension</code> columns default to
			<code class="text-ocean-400">{importChecklist}{importExtension ? ' + ' + importExtension : ''}</code> for required-parameter validation.
		</p>

		{#if importFileName}
			<p class="text-xs text-slate-500">File: {importFileName}</p>
		{/if}

		<!-- People applied to every imported sample -->
		<PeoplePicker
			bind:people={importPeople}
			personnel={data.personnel}
			roleOptions={data.picklists.person_role}
			defaultRole="collector"
			label="Apply people to all imported samples"
		/>

		<!-- One definition, rendered at the top of the form and again under the
		     preview: the panels are long enough that the button that acts on
		     them scrolls out of sight while they are being read. -->
		{#snippet importButton()}
			{#if importPreview && importPreview.samples.length > 0}
				<button onclick={runImport} disabled={importing || hasDuplicates} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">
					{importing ? 'Importing...' : `Import ${importPreview.count} Samples`}
				</button>
			{/if}
		{/snippet}

		{#if hasImportRows}
		<div class="flex gap-3 items-start flex-wrap">
			<button onclick={previewImport} disabled={importing} class="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:opacity-50 transition-colors text-sm font-medium">
				{importing ? 'Parsing...' : 'Validate'}
			</button>
			{@render importButton()}
			{#if importTsv}
			<button onclick={downloadTsv} disabled={importing}
				title="Download these rows as a TSV, correct them in a spreadsheet, then re-import from Upload file"
				class="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:opacity-50 transition-colors text-sm font-medium">
				Export TSV
			</button>
			{/if}

			<!-- Inline status area: success/errors/warnings next to buttons -->
			{#if importResult}
				<div class="flex-1 min-w-64 px-3 py-2 rounded-lg text-sm {importResult.imported > 0 ? 'bg-green-900/20 border border-green-800 text-green-300' : 'bg-red-900/20 border border-red-800 text-red-300'}">
					{#if importResult.imported > 0}
						<!-- Rows first: that is what the operator handed over. Samples
						     are counted separately because an archive sheet carries one
						     row per run, and several runs often describe one sample. -->
						<span class="font-medium">{importResult.rows ?? importResult.imported} rows imported</span>
						· {plural(importResult.imported, 'sample')}
						{#if importResult.new_projects}· {plural(importResult.new_projects, 'new project')}{/if}
						{#if importResult.site_matches}· {importResult.site_matches} matched{/if}
						{#if importResult.new_sites}· {plural(importResult.new_sites, 'new site')}{/if}
						{#if importResult.extracts_created}· {plural(importResult.extracts_created, 'extract')}{/if}
						{#if importResult.pcrs_created}· {importResult.pcrs_created} PCRs{/if}
						{#if importResult.libraries_created}· {plural(importResult.libraries_created, 'library', 'libraries')}{/if}
						{#if importResult.runs_created}· {plural(importResult.runs_created, 'run')}{/if}
						{#if importResult.errors.length > 0}· <span class="text-yellow-300">{plural(importResult.errors.length, 'warning')}</span>{/if}
						<a href="/samples" class="ml-2 text-ocean-400 hover:text-ocean-300">View samples →</a>
					{:else}
						{importResult.errors[0] || 'Import failed'}
					{/if}
				</div>
			{:else if importPreview}
				{#if hasDuplicates}
					<div class="flex-1 min-w-64 px-3 py-2 rounded-lg text-sm bg-red-900/20 border border-red-800 text-red-300">
						Fix duplicate target fields before importing
					</div>
				{:else if importPreview.errors.length > 0}
					<div class="flex-1 min-w-64 px-3 py-2 rounded-lg text-sm bg-yellow-900/20 border border-yellow-800 text-yellow-300">
						{importPreview.errors.length} warning{importPreview.errors.length === 1 ? '' : 's'} — see below
					</div>
				{:else}
					<div class="flex-1 min-w-64 px-3 py-2 rounded-lg text-sm bg-slate-800/50 border border-slate-700 text-slate-400">
						Ready to import {importPreview.count} sample{importPreview.count === 1 ? '' : 's'}
					</div>
				{/if}
			{/if}
		</div>
		{/if}

		{#if importPreview}
		<div class="space-y-3">
			{#if importPreview.column_map}
				<div class="rounded-lg border border-slate-800 bg-slate-900/50">
					<button
						type="button"
						onclick={() => { showMapper = !showMapper; }}
						class="w-full flex items-center justify-between px-4 py-2 text-sm text-slate-300 hover:text-white cursor-pointer"
					>
						<span>
							Column mapping ·
							<span class="text-slate-500">
								{Object.values(columnMap).filter((v) => v && v !== '_skip_').length} mapped
								&middot;
								{Object.values(columnMap).filter((v) => !v || v === '_skip_').length} skipped
							</span>
						</span>
						<span class="text-xs text-slate-500">{showMapper ? '▾' : '▸'}</span>
					</button>
					{#if showMapper}
						<div class="p-4 pt-0 space-y-2">
							<p class="text-xs text-slate-500">
								Override SampleTown's auto-detection. Type to search — matches against every MIxS parameter
								(~786) plus SampleTown-local fields. Leave blank to skip. Type <code class="text-amber-400">misc_param:&lt;name&gt;</code>
								to add a truly custom tag. The <em>goes to</em> column shows which SampleTown tab the value lands on.
							</p>

							<!-- Autocomplete dataset — one <datalist> shared across all input rows. -->
							<datalist id="mapper-targets">
								{#each importPreview.available_fields ?? [] as f (f.value)}
									<option value={f.value}>{f.value} — {f.table}{f.title ? ' · ' + f.title : ''}</option>
								{/each}
							</datalist>

							<div class="max-h-72 overflow-y-auto">
								<table class="w-full text-xs">
									<thead class="sticky top-0 bg-slate-900/80 backdrop-blur">
										<tr class="text-slate-400 border-b border-slate-800">
											<th class="px-2 py-1.5 text-left font-medium">{importSource === 'accession' ? 'Archive column' : 'File column'}</th>
											<th class="px-2 py-1.5 text-left font-medium">Target field</th>
											<th class="px-2 py-1.5 text-left font-medium">Goes to</th>
										</tr>
									</thead>
									<tbody>
										{#each Object.keys(importPreview.column_map) as header}
											<tr class="border-b border-slate-800/40">
												<!-- The archive's own name for the field. A fetch tags an
												     off-schema field as misc_param:<name> to route it, but that
												     prefix is where the value is going, not what it arrived as,
												     and showing it here means naming a column nobody sent. -->
												<td class="px-2 py-1.5 font-mono text-slate-300 align-top" title={header}>{sourceColumn(header)}</td>
												<td class="px-2 py-1.5">
													<input
														type="text"
														list="mapper-targets"
														bind:value={columnMap[header]}
														placeholder="(skip)"
														class="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-xs font-mono focus:outline-none focus:border-ocean-500"
													/>
												</td>
												<td class="px-2 py-1.5 text-xs text-slate-400 align-top">
													{#if tabFor(columnMap[header])}
														<span class="text-slate-500">→</span>
														<span class="{columnMap[header]?.startsWith('misc_param:') ? 'text-amber-300' : 'text-ocean-400'}">{tabFor(columnMap[header])}</span>
													{/if}
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
							{#if hasDuplicates}
								<div class="p-2 rounded bg-red-900/30 border border-red-800 text-red-300 text-xs space-y-1">
									<p class="font-medium">Multiple columns mapped to the same target field:</p>
									{#each duplicateTargets as d}
										<div>{d.headers.join(', ')} &rarr; <strong>{d.field}</strong></div>
									{/each}
								</div>
							{/if}
							<div class="flex justify-end pt-2">
								<button
									onclick={revalidateWithMapping}
									disabled={importing || hasDuplicates}
									class="px-3 py-1.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:opacity-50 text-xs font-medium"
								>
									{importing ? 'Re-validating...' : 'Re-validate with mapping'}
								</button>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Warning count scales with the upload: a project can contribute a
			     line per row, so the list scrolls instead of pushing the import
			     button off the page. -->
			{#if importPreview.errors.length > 0}
			<div class="p-3 rounded-lg bg-yellow-900/20 border border-yellow-800 text-yellow-300 text-sm">
				<div class="font-medium mb-1">
					{importPreview.errors.length} warning{importPreview.errors.length === 1 ? '' : 's'}
				</div>
				<div class="max-h-56 overflow-y-auto space-y-1 pr-1">
					{#each importPreview.errors as err}
						<div>{err}</div>
					{/each}
				</div>
			</div>
			{/if}

			<!-- MIxS LinkML validation — per-row ajv errors against the
			     materialized combination class. -->
			{#if importPreview.mixs_validation}
				{@const rowsWithErrors = importPreview.mixs_validation.filter((r) => r.errors.length > 0)}
				{#if rowsWithErrors.length > 0}
				<details class="p-3 rounded-lg bg-rose-900/20 border border-rose-800 text-rose-200 text-sm">
					<summary class="cursor-pointer font-medium">
						{rowsWithErrors.length} of {importPreview.mixs_validation.length} samples fail MIxS validation
						<span class="text-xs text-rose-300/70 ml-1">
							(checklist+extension compliance per mixs.yaml v6.3.0)
						</span>
					</summary>
					<!-- Validation reports how far a sheet is from the standard. It
					     does not gate the import: an archive record is routinely
					     missing slots its checklist calls for, and refusing it would
					     leave the operator with no record at all. -->
					<p class="mt-2 text-xs text-rose-300/80">
						These rows still import. MIxS compliance is reported so gaps can be
						filled in later, and never blocks an import.
					</p>
					<div class="mt-2 space-y-2 max-h-80 overflow-y-auto">
						{#each rowsWithErrors as row}
							<div class="border-l-2 border-rose-700 pl-2">
								<div class="text-xs">
									<code class="text-rose-100">{row.samp_name}</code>
									<span class="text-rose-300/60">&nbsp;· {row.checklist}{row.extension ? ' + ' + row.extension : ''}</span>
								</div>
								<ul class="mt-0.5 space-y-0.5 text-xs text-rose-300">
									{#each row.errors as e}
										<li>
											<code class="text-rose-400">{e.slot}</code>
											<span class="text-rose-200/80">: {e.message}</span>
										</li>
									{/each}
								</ul>
							</div>
						{/each}
					</div>
				</details>
				{:else}
				<div class="p-2 rounded-lg bg-emerald-900/20 border border-emerald-800 text-emerald-300 text-xs">
					All {importPreview.mixs_validation.length} samples pass MIxS validation against their checklist+extension.
				</div>
				{/if}
			{/if}

			<!-- Panels follow the order the records are made in: a project holds
			     sites, a site holds samples, and a sample carries the chain from
			     extract through PCR and library to the run it was sequenced on. -->
			{#if importPreview.new_projects && importPreview.new_projects.length > 0}
				<div class="p-3 rounded-lg bg-violet-900/20 border border-violet-800 text-violet-200 text-sm space-y-2">
					<p class="font-medium text-violet-200">
						{importPreview.new_projects.length} new project{importPreview.new_projects.length === 1 ? '' : 's'} will be created
					</p>
					<details>
						<summary class="cursor-pointer text-xs text-violet-300 hover:text-violet-200">
							Show new projects
						</summary>
						<div class="mt-2 space-y-0.5 text-xs text-slate-300 font-mono max-h-40 overflow-y-auto">
							{#each importPreview.new_projects as p}
								<div>{p.project_name}</div>
							{/each}
						</div>
					</details>
				</div>
			{/if}

			{#if importPreview.site_matches && importPreview.site_matches.length > 0}
				{@const linked = importPreview.site_matches.filter((m) => m.site && !m.new_site)}
				{@const newSites = importPreview.new_sites ?? []}
				{#if linked.length > 0 || newSites.length > 0}
				<div class="p-3 rounded-lg bg-ocean-900/20 border border-ocean-800 text-ocean-200 text-sm space-y-2">
					{#if linked.length > 0}
					<p class="font-medium">
						{linked.length} sample{linked.length === 1 ? '' : 's'} matched to existing site{linked.length === 1 ? '' : 's'}
						(within {siteMatchKm}&nbsp;km)
					</p>
					<details>
						<summary class="cursor-pointer text-xs text-ocean-300 hover:text-ocean-200">
							Show matches
						</summary>
						<div class="mt-2 space-y-0.5 text-xs text-slate-300 font-mono max-h-40 overflow-y-auto">
							{#each linked as m}
								<div>{m.samp_name} → {m.site?.site_name} ({m.site?.distance_km} km)</div>
							{/each}
						</div>
					</details>
					{/if}
					{#if newSites.length > 0}
					<p class="font-medium text-green-300">
						{newSites.length} new site{newSites.length === 1 ? '' : 's'} will be created
					</p>
					<details>
						<summary class="cursor-pointer text-xs text-green-400 hover:text-green-300">
							Show new sites
						</summary>
						<div class="mt-2 space-y-0.5 text-xs text-slate-300 font-mono max-h-40 overflow-y-auto">
							{#each newSites as s}
								<div>{s.site_name} — {s.lat_lon} {s.geo_loc_name ? `(${s.geo_loc_name})` : ''}</div>
							{/each}
						</div>
					</details>
					{/if}
				</div>
				{/if}
			{/if}

			<div>
				<p class="text-sm text-slate-300 mb-2">{importPreview.count} samples parsed — mapped columns: {importPreview.headers.length}</p>
				<div class="overflow-x-auto max-h-72 overflow-y-auto rounded-lg border border-slate-800">
					<table class="text-xs">
						<thead class="sticky top-0">
							<tr class="bg-slate-900">
								<th class="px-2 py-1.5 text-left font-medium text-slate-400 border-b border-slate-700">sample_name</th>
								<th class="px-2 py-1.5 text-left font-medium text-slate-400 border-b border-slate-700">collection_date</th>
								<th class="px-2 py-1.5 text-left font-medium text-ocean-400 border-b border-slate-700">site: lat_lon</th>
								<th class="px-2 py-1.5 text-left font-medium text-ocean-400 border-b border-slate-700">site: geo_loc_name</th>
								<th class="px-2 py-1.5 text-left font-medium text-ocean-400 border-b border-slate-700">site: env_broad_scale</th>
								<th class="px-2 py-1.5 text-left font-medium text-slate-400 border-b border-slate-700">env_medium</th>
								<th class="px-2 py-1.5 text-left font-medium text-slate-400 border-b border-slate-700">checklist</th>
							</tr>
						</thead>
						<tbody>
							{#each importPreview.samples as s, i}
							<tr class="border-b border-slate-800/30 {i % 2 ? 'bg-slate-900/30' : ''}">
								<td class="px-2 py-1 text-white">{s.samp_name}</td>
								<td class="px-2 py-1 text-slate-300">{s.collection_date || '—'}</td>
								<td class="px-2 py-1 text-slate-300">{s.lat_lon || '—'}</td>
								<td class="px-2 py-1 text-slate-300">{s.geo_loc_name || '—'}</td>
								<td class="px-2 py-1 text-slate-300">{s.env_broad_scale || '—'}</td>
								<td class="px-2 py-1 text-slate-300">{s.env_medium || '—'}</td>
								<td class="px-2 py-1 text-slate-300">{s.mixs_checklist}</td>
							</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</div>

			{#if importPreview.extracts && importPreview.extracts.length > 0}
				<div class="p-3 rounded-lg bg-amber-900/20 border border-amber-800 text-amber-200 text-sm space-y-2">
					<p class="font-medium text-amber-200">
						{importPreview.extracts.length} DNA extract{importPreview.extracts.length === 1 ? '' : 's'} will be created
					</p>
					<details>
						<summary class="cursor-pointer text-xs text-amber-300 hover:text-amber-200">
							Show extracts
						</summary>
						<div class="mt-2 space-y-0.5 text-xs text-slate-300 font-mono max-h-40 overflow-y-auto">
							{#each importPreview.extracts as ex}
								<div>
									{ex.extract_name}
									<span class="text-slate-500">·</span>
									{ex.samp_name}
									{#if ex.extraction_date}<span class="text-slate-500"> · {ex.extraction_date}</span>{/if}
									{#if ex.concentration_ng_ul != null}<span class="text-slate-500"> · {ex.concentration_ng_ul} ng/µL</span>{/if}
									{#if ex.storage_box}<span class="text-slate-500"> · box {ex.storage_box}</span>{/if}
									{#if ex.storage_location}<span class="text-slate-500"> / {ex.storage_location}</span>{/if}
								</div>
							{/each}
						</div>
					</details>
				</div>
			{/if}

			{#if importPreview.pcrs && importPreview.pcrs.length > 0}
				<div class="p-3 rounded-lg bg-amber-900/20 border border-amber-800 text-amber-200 text-sm space-y-2">
					<p class="font-medium text-amber-200">
						{importPreview.pcrs.length} PCR{importPreview.pcrs.length === 1 ? '' : 's'} will be created
					</p>
					<details>
						<summary class="cursor-pointer text-xs text-amber-300 hover:text-amber-200">
							Show PCRs
						</summary>
						<div class="mt-2 space-y-0.5 text-xs text-slate-300 font-mono max-h-40 overflow-y-auto">
							{#each importPreview.pcrs as pc}
								<div>
									{pc.pcr_name}
									<span class="text-slate-500">·</span>
									{pc.samp_name}
									{#if pc.target_gene}<span class="text-slate-500"> · {pc.target_gene}</span>{/if}
									{#if pc.target_subfragment}<span class="text-slate-500"> {pc.target_subfragment}</span>{/if}
									{#if pc.forward_primer_name}<span class="text-slate-500"> · {pc.forward_primer_name}</span>{/if}
									{#if pc.reverse_primer_name}<span class="text-slate-500"> / {pc.reverse_primer_name}</span>{/if}
									{#if pc.pcr_date}<span class="text-slate-500"> · {pc.pcr_date}</span>{/if}
								</div>
							{/each}
						</div>
					</details>
				</div>
			{/if}

			{#if importPreview.libraries && importPreview.libraries.length > 0}
				<div class="p-3 rounded-lg bg-cyan-900/20 border border-cyan-800 text-cyan-200 text-sm space-y-2">
					<p class="font-medium text-cyan-200">
						{importPreview.libraries.length} sequencing librar{importPreview.libraries.length === 1 ? 'y' : 'ies'} will be created
					</p>
					<details>
						<summary class="cursor-pointer text-xs text-cyan-300 hover:text-cyan-200">
							Show libraries
						</summary>
						<div class="mt-2 space-y-0.5 text-xs text-slate-300 font-mono max-h-40 overflow-y-auto">
							{#each importPreview.libraries as lib}
								<div>
									{lib.library_name}
									<span class="text-slate-500">·</span>
									{lib.samp_name}
									{#if lib.library_barcode}<span class="text-slate-500"> · {lib.library_barcode}</span>{/if}
									{#if lib.library_platform}<span class="text-slate-500"> · {lib.library_platform}</span>{/if}
									{#if lib.library_concentration_ng_ul != null}<span class="text-slate-500"> · {lib.library_concentration_ng_ul} ng/µL</span>{/if}
									{#if lib.run_name}<span class="text-slate-500"> → run {lib.run_name}</span>{/if}
								</div>
							{/each}
						</div>
					</details>
				</div>
			{/if}

			{#if importPreview.new_runs && importPreview.new_runs.length > 0}
				<div class="p-3 rounded-lg bg-sky-900/20 border border-sky-800 text-sky-200 text-sm space-y-2">
					<p class="font-medium text-sky-200">
						{importPreview.new_runs.length} sequencing run{importPreview.new_runs.length === 1 ? '' : 's'} will be created
					</p>
					<details>
						<summary class="cursor-pointer text-xs text-sky-300 hover:text-sky-200">
							Show runs
						</summary>
						<div class="mt-2 space-y-0.5 text-xs text-slate-300 font-mono max-h-40 overflow-y-auto">
							{#each importPreview.new_runs as r}
								<div>
									{r.run_name}
									{#if r.run_date}<span class="text-slate-500"> · {r.run_date}</span>{/if}
									{#if r.run_platform}<span class="text-slate-500"> · {r.run_platform}</span>{/if}
									{#if r.run_flow_cell_id}<span class="text-slate-500"> · {r.run_flow_cell_id}</span>{/if}
								</div>
							{/each}
						</div>
					</details>
				</div>
			{/if}

			<!-- The same action again, after everything it acts on. -->
			{#if importPreview.samples.length > 0}
				<div class="flex items-center gap-3 pt-1 border-t border-slate-800">
					<div class="pt-3">{@render importButton()}</div>
					{#if hasDuplicates}
						<span class="pt-3 text-xs text-red-300">Fix the duplicate target fields above first.</span>
					{/if}
				</div>
			{/if}
		{/if}

		{#if importResult && importResult.errors.length > 0}
			<div class="p-3 rounded-lg bg-yellow-900/20 border border-yellow-800 text-sm text-yellow-300">
				<div class="font-medium mb-1">
					{importResult.errors.length} warning{importResult.errors.length === 1 ? '' : 's'}
				</div>
				<div class="max-h-56 overflow-y-auto space-y-1 pr-1">
					{#each importResult.errors as err}<div>{err}</div>{/each}
				</div>
			</div>
		{/if}
		{/if}

	</div>
	{/if}
</div>
