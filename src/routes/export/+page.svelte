<script lang="ts">
	import type { PageData } from './$types';
	import PeoplePicker from '$lib/components/PeoplePicker.svelte';
	import { CHECKLIST_OPTIONS, EXTENSION_OPTIONS } from '$lib/mixs/checklists';
	import { MIXS_ACTIVE_VERSION } from '$lib/mixs/schema-index';

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
	let importProject = $state('');
	let importTsv = $state('');
	let importFileName = $state('');
	let siteMatchKm = $state(1);
	/** Default MIxS checklist + extension applied to rows whose TSV doesn't
	 *  carry mixs_checklist / extension columns. Drives import-side validation
	 *  and the default combination class for required-slot resolution. */
	let importChecklist = $state('MimarksS');
	let importExtension = $state('Water');
	type SiteMatch = { samp_name: string; new_site: boolean; site: { id: string; site_name: string; distance_km: number } | null };
	type NewSite = { id: string; site_name: string; lat_lon: string; geo_loc_name: string | null };
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
		column_map?: Record<string, string>;
		available_fields?: { value: string; table: string; title?: string }[];
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
	let importResult: { imported: number; errors: string[]; site_matches?: number; new_sites?: number } | null = $state(null);

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
			fd.append('siteMatchKm', String(siteMatchKm));
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
					projectId: importProject,
					dryRun,
					siteMatchKm,
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
		<p class="text-sm text-slate-400">Import samples from a MIxS-compliant TSV file. Sites are auto-created or matched by proximity.</p>

		<div class="flex gap-4 items-end flex-wrap">
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
			<div>
				<label class="block text-xs font-medium text-slate-400 mb-1">Site match radius</label>
				<div class="flex items-center gap-2">
					<input type="range" min="0.001" max="10" step="0.001" bind:value={siteMatchKm}
						class="w-24 accent-ocean-500" />
					<input type="number" min="0.001" max="100" step="0.001" bind:value={siteMatchKm}
						class="w-20 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-ocean-500" />
					<span class="text-xs text-slate-500">km</span>
				</div>
			</div>
		</div>
		<p class="text-xs text-slate-500">
			Rows without <code>mixs_checklist</code> / <code>extension</code> columns default to
			<code class="text-ocean-400">{importChecklist}{importExtension ? ' + ' + importExtension : ''}</code> for required-slot validation.
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

		{#if importFile && importProject}
		<div class="flex gap-3 items-start flex-wrap">
			<button onclick={previewImport} disabled={importing} class="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 disabled:opacity-50 transition-colors text-sm font-medium">
				{importing ? 'Parsing...' : 'Validate'}
			</button>
			{#if importPreview && importPreview.samples.length > 0}
			<button onclick={runImport} disabled={importing || hasDuplicates} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">
				{importing ? 'Importing...' : `Import ${importPreview.count} Samples`}
			</button>
			{/if}

			<!-- Inline status area: success/errors/warnings next to buttons -->
			{#if importResult}
				<div class="flex-1 min-w-64 px-3 py-2 rounded-lg text-sm {importResult.imported > 0 ? 'bg-green-900/20 border border-green-800 text-green-300' : 'bg-red-900/20 border border-red-800 text-red-300'}">
					{#if importResult.imported > 0}
						<span class="font-medium">{importResult.imported} imported</span>
						{#if importResult.site_matches}· {importResult.site_matches} matched{/if}
						{#if importResult.new_sites}· {importResult.new_sites} new sites{/if}
						{#if importResult.errors.length > 0}· <span class="text-yellow-300">{importResult.errors.length} warnings</span>{/if}
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
								Override SampleTown's auto-detection. Type to search — matches against every MIxS slot
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
											<th class="px-2 py-1.5 text-left font-medium">File column</th>
											<th class="px-2 py-1.5 text-left font-medium">Target field</th>
											<th class="px-2 py-1.5 text-left font-medium">Goes to</th>
										</tr>
									</thead>
									<tbody>
										{#each Object.keys(importPreview.column_map) as header}
											<tr class="border-b border-slate-800/40">
												<td class="px-2 py-1.5 font-mono text-slate-300 align-top">{header}</td>
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

			{#if importPreview.errors.length > 0}
			<div class="p-3 rounded-lg bg-yellow-900/20 border border-yellow-800 text-yellow-300 text-sm space-y-1">
				{#each importPreview.errors as err}
					<div>{err}</div>
				{/each}
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
							{#each importPreview.samples.slice(0, 30) as s, i}
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
		{/if}

		{#if importResult && importResult.errors.length > 0}
			<div class="p-3 rounded-lg bg-yellow-900/20 border border-yellow-800 text-sm space-y-1 text-yellow-300">
				<div class="font-medium">Warnings:</div>
				{#each importResult.errors as err}<div>{err}</div>{/each}
			</div>
		{/if}

		<!-- MIxS v6.3 templates — generated from SampleTown's bundled LinkML
		     schema, so column headers exactly match what the import parser
		     recognizes. NCBI BioSample's public templates still lag at v6.0;
		     using our own generation keeps everything in sync. -->
		<div class="p-4 rounded-lg border border-slate-800 bg-slate-900/50 space-y-3">
			<h3 class="text-sm font-medium text-slate-300">MIxS v{MIXS_ACTIVE_VERSION} templates</h3>
			<p class="text-xs text-slate-500">
				Pick a checklist and extension to download an empty TSV with the exact columns that combination requires and recommends.
				Required slots are prefixed with <code class="text-rose-400">*</code>. Fill in the file, save as TSV, and import above.
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
	</div>
	{/if}
</div>
