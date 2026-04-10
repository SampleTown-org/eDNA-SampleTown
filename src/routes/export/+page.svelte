<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let mode = $state<'export' | 'import'>('export');

	// --- Export ---
	let exportProject = $state('');
	let exportChecklist = $state('');
	let previewTsv = $state('');
	let previewRows = $state(0);
	let exporting = $state(false);
	let previewLines = $derived(previewTsv ? previewTsv.trim().split('\n') : []);

	async function previewExport() {
		exporting = true;
		const params = new URLSearchParams({ format: 'preview' });
		if (exportProject) params.set('project_id', exportProject);
		if (exportChecklist) params.set('checklist', exportChecklist);
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
		window.location.href = `/api/export/mixs?${params}`;
	}

	// --- Import ---
	let importProject = $state('');
	let importTsv = $state('');
	let importFileName = $state('');
	type SiteMatch = { samp_name: string; site: { id: string; site_name: string; distance_km: number } | null };
	let importPreview: {
		samples: any[];
		errors: string[];
		headers: string[];
		count: number;
		site_matches?: SiteMatch[];
		column_map?: Record<string, string>;
		available_fields?: string[];
	} | null = $state(null);
	let importing = $state(false);
	let importResult: { imported: number; errors: string[]; site_matches?: number } | null = $state(null);

	// Column mapper state — populated from the dry-run response and editable by the user.
	let columnMap = $state<Record<string, string>>({});
	let showMapper = $state(false);

	let importFile: File | null = $state(null);

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

	async function sendImport(dryRun: boolean, useMapping: boolean = false) {
		if (!importProject || !importFile) return;
		importing = true;

		const colMapJson = useMapping && Object.keys(columnMap).length > 0 ? JSON.stringify(columnMap) : null;

		let res: Response;
		if (importFile.name.endsWith('.xlsx') || importFile.name.endsWith('.xls')) {
			const fd = new FormData();
			fd.append('file', importFile);
			fd.append('projectId', importProject);
			fd.append('dryRun', String(dryRun));
			if (colMapJson) fd.append('columnMap', colMapJson);
			res = await fetch('/api/import/mixs', { method: 'POST', body: fd });
		} else {
			res = await fetch('/api/import/mixs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					tsv: importTsv,
					projectId: importProject,
					dryRun,
					columnMap: colMapJson ? JSON.parse(colMapJson) : undefined
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

	async function previewImport() { await sendImport(true, false); }
	async function revalidateWithMapping() { await sendImport(true, true); }
	async function runImport() { await sendImport(false, true); }

	const selectCls = 'px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500';
</script>

<div class="max-w-5xl space-y-6">
	<h1 class="text-2xl font-bold text-white">MIxS Import / Export</h1>

	<div class="flex gap-1 p-1 bg-slate-800 rounded-lg w-fit">
		<button onclick={() => mode = 'export'} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {mode === 'export' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">Export</button>
		<button onclick={() => mode = 'import'} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {mode === 'import' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">Import</button>
	</div>

	{#if mode === 'export'}
	<div class="space-y-4">
		<p class="text-sm text-slate-400">Export samples as MIxS-compliant TSV for NCBI BioSample / SRA submission.</p>

		<div class="flex gap-4 items-end">
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
					<option value="">All checklists</option>
					{#each data.checklists as c}<option value={c.mixs_checklist}>{c.mixs_checklist}</option>{/each}
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
		<p class="text-sm text-slate-400">Import samples from a MIxS-compliant TSV file. Accepts both SRA/BioSample column headers and internal field names.</p>

		<div class="flex gap-4 items-end">
			<div>
				<label class="block text-xs font-medium text-slate-400 mb-1">Target Project</label>
				<select bind:value={importProject} class={selectCls}>
					<option value="">Select project...</option>
					{#each data.projects as p}<option value={p.id}>{p.project_name}</option>{/each}
				</select>
			</div>
			<div>
				<label class="block text-xs font-medium text-slate-400 mb-1">File (.xlsx, .tsv, .csv)</label>
				<input type="file" accept=".xlsx,.xls,.tsv,.txt,.csv" onchange={handleFile}
					class="text-sm text-slate-400 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-slate-700 file:text-white file:text-sm file:cursor-pointer hover:file:bg-slate-600" />
			</div>
		</div>

		{#if importFileName}
			<p class="text-xs text-slate-500">File: {importFileName}</p>
		{/if}

		{#if importFile && importProject}
		<div class="flex gap-3">
			<button onclick={previewImport} disabled={importing} class="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:opacity-50 transition-colors text-sm font-medium">
				{importing ? 'Parsing...' : 'Validate'}
			</button>
			{#if importPreview && importPreview.samples.length > 0}
			<button onclick={runImport} disabled={importing} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">
				{importing ? 'Importing...' : `Import ${importPreview.count} Samples`}
			</button>
			{/if}
		</div>
		{/if}

		{#if importPreview}
		<div class="space-y-3">
			{#if importPreview.column_map}
				<div class="rounded-lg border border-slate-800 bg-slate-900/50">
					<button
						type="button"
						onclick={() => (showMapper = !showMapper)}
						class="w-full flex items-center justify-between px-4 py-2 text-sm text-slate-300 hover:text-white"
					>
						<span>
							Column mapping ·
							<span class="text-slate-500">
								{Object.values(columnMap).filter((v) => v && v !== '_skip_').length} mapped
								&middot;
								{Object.values(columnMap).filter((v) => v === '_skip_').length} skipped
								&middot;
								{Object.values(columnMap).filter((v) => !v).length} unmapped
							</span>
						</span>
						<span class="text-xs text-slate-500">{showMapper ? '▾' : '▸'}</span>
					</button>
					{#if showMapper}
						<div class="p-4 pt-0 space-y-2">
							<p class="text-xs text-slate-500">
								Override SampleTown's auto-detection. Unmapped columns are ignored. Use
								<code>_skip_</code> to deliberately drop a column.
							</p>
							<div class="max-h-72 overflow-y-auto">
								<table class="w-full text-xs">
									<thead class="sticky top-0 bg-slate-900/80 backdrop-blur">
										<tr class="text-slate-400 border-b border-slate-800">
											<th class="px-2 py-1.5 text-left font-medium">File column</th>
											<th class="px-2 py-1.5 text-left font-medium">→ Target field</th>
										</tr>
									</thead>
									<tbody>
										{#each Object.keys(importPreview.column_map) as header}
											<tr class="border-b border-slate-800/40">
												<td class="px-2 py-1.5 font-mono text-slate-300">{header}</td>
												<td class="px-2 py-1.5">
													<select
														bind:value={columnMap[header]}
														class="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-xs focus:outline-none focus:border-ocean-500"
													>
														<option value="">(unmapped — ignored)</option>
														<option value="_skip_">(skip — drop column)</option>
														{#each importPreview.available_fields ?? [] as f}
															<option value={f}>{f}</option>
														{/each}
													</select>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
							<div class="flex justify-end pt-2">
								<button
									onclick={revalidateWithMapping}
									disabled={importing}
									class="px-3 py-1.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:opacity-50 text-xs font-medium"
								>
									{importing ? 'Re-validating...' : 'Re-validate with mapping'}
								</button>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			{#if importPreview.errors.length > 0}
			<div class="p-3 rounded-lg bg-yellow-900/20 border border-yellow-800 text-yellow-300 text-sm space-y-1">
				{#each importPreview.errors as err}
					<div>{err}</div>
				{/each}
			</div>
			{/if}

			{#if importPreview.site_matches && importPreview.site_matches.length > 0}
				{@const linked = importPreview.site_matches.filter((m) => m.site)}
				{#if linked.length > 0}
				<div class="p-3 rounded-lg bg-ocean-900/20 border border-ocean-800 text-ocean-200 text-sm">
					<p class="font-medium">
						{linked.length} of {importPreview.site_matches.length} samples will auto-link
						to an existing site within 1&nbsp;km
					</p>
					<details class="mt-2">
						<summary class="cursor-pointer text-xs text-ocean-300 hover:text-ocean-200">
							Show matches
						</summary>
						<div class="mt-2 space-y-0.5 text-xs text-slate-300 font-mono max-h-40 overflow-y-auto">
							{#each linked as m}
								<div>{m.samp_name} → {m.site?.site_name} ({m.site?.distance_km} km)</div>
							{/each}
						</div>
					</details>
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
								<th class="px-2 py-1.5 text-left font-medium text-slate-400 border-b border-slate-700">lat_lon</th>
								<th class="px-2 py-1.5 text-left font-medium text-slate-400 border-b border-slate-700">geo_loc_name</th>
								<th class="px-2 py-1.5 text-left font-medium text-slate-400 border-b border-slate-700">env_broad_scale</th>
								<th class="px-2 py-1.5 text-left font-medium text-slate-400 border-b border-slate-700">checklist</th>
								<th class="px-2 py-1.5 text-left font-medium text-slate-400 border-b border-slate-700">env_package</th>
							</tr>
						</thead>
						<tbody>
							{#each importPreview.samples.slice(0, 30) as s, i}
							<tr class="border-b border-slate-800/30 {i % 2 ? 'bg-slate-900/30' : ''}">
								<td class="px-2 py-1 text-white">{s.samp_name}</td>
								<td class="px-2 py-1 text-slate-300">{s.collection_date || '—'}</td>
								<td class="px-2 py-1 text-slate-300">{s.lat_lon || '—'}</td>
								<td class="px-2 py-1 text-slate-300">{s.geo_loc_name || '—'}</td>
								<td class="px-2 py-1 text-slate-300">{s.env_broad_scale || '—'}</td>
								<td class="px-2 py-1 text-slate-300">{s.mixs_checklist}</td>
								<td class="px-2 py-1 text-slate-300">{s.env_package}</td>
							</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</div>
		</div>
		{/if}

		{#if importResult}
		<div class="p-4 rounded-lg {importResult.imported > 0 ? 'bg-green-900/20 border border-green-800' : 'bg-red-900/20 border border-red-800'}">
			{#if importResult.imported > 0}
				<p class="text-green-300 font-medium">{importResult.imported} samples imported successfully</p>
				{#if importResult.site_matches && importResult.site_matches > 0}
					<p class="text-sm text-ocean-300 mt-1">{importResult.site_matches} auto-linked to nearby sites (within 1 km)</p>
				{/if}
				<a href="/samples" class="text-sm text-ocean-400 hover:text-ocean-300 mt-1 inline-block">View samples &rarr;</a>
			{/if}
			{#if importResult.errors.length > 0}
				<div class="text-sm text-yellow-300 mt-2 space-y-1">
					{#each importResult.errors as err}<div>{err}</div>{/each}
				</div>
			{/if}
		</div>
		{/if}

		<!-- NCBI Templates -->
		<div class="p-4 rounded-lg border border-slate-800 bg-slate-900/50 space-y-3">
			<h3 class="text-sm font-medium text-slate-300">NCBI BioSample Templates</h3>
			<p class="text-xs text-slate-500">Download official NCBI xlsx templates, fill them in, and import directly. SampleTown maps NCBI column headers automatically.</p>
			<div class="flex flex-wrap gap-2">
				{#each [
					{ label: 'MIMARKS Specimen', file: 'MIMARKS.specimen.6.0' },
					{ label: 'MIMARKS Survey', file: 'MIMARKS.survey.6.0' },
					{ label: 'MIMS (Metagenome)', file: 'MIMS.me.6.0' },
					{ label: 'MIMAG', file: 'MIMAG.6.0' },
					{ label: 'MISAG', file: 'MISAG.6.0' },
					{ label: 'MIGS Bacteria', file: 'MIGS.ba.6.0' },
					{ label: 'MIGS Eukaryote', file: 'MIGS.eu.6.0' },
					{ label: 'MIGS Virus', file: 'MIGS.vi.6.0' },
					{ label: 'MIUViG', file: 'MIUVIG.6.0' }
				] as tmpl}
					<a href="https://www.ncbi.nlm.nih.gov/biosample/docs/templates/packages/{tmpl.file}.xlsx"
						target="_blank" rel="noopener"
						class="px-2 py-1 bg-slate-700 text-slate-300 rounded text-xs hover:bg-slate-600 hover:text-white transition-colors">
						{tmpl.label}
					</a>
				{/each}
			</div>
			<div class="pt-1">
				<button onclick={() => { window.location.href = '/api/export/mixs?project_id=_none_'; }} class="px-2 py-1 bg-slate-800 text-slate-400 rounded text-xs hover:bg-slate-700 hover:text-white transition-colors">
					SampleTown Empty Template (TSV)
				</button>
			</div>
		</div>
	</div>
	{/if}
</div>
