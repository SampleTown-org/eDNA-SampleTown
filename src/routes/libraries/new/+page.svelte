<script lang="ts">
	import { goto } from '$app/navigation';
	import { SEQUENCING_PLATFORMS, INSTRUMENT_MODELS } from '$lib/mixs/controlled-vocab';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	const LIBRARY_TYPES = [
		{ value: '16S_amplicon', label: '16S Amplicon' }, { value: '18S_amplicon', label: '18S Amplicon' },
		{ value: 'CO1_amplicon', label: 'CO1 Amplicon' }, { value: '12S_amplicon', label: '12S Amplicon' },
		{ value: 'nanopore_metagenomic', label: 'Nanopore Metagenomic' }, { value: 'illumina_metagenomic', label: 'Illumina Metagenomic' },
		{ value: 'rnaseq', label: 'RNA-seq' }, { value: 'other', label: 'Other' }
	];

	let mode = $state<'single' | 'batch'>('single');

	// Single mode
	let sourceType = $state<'pcr' | 'extract'>(data.preselectedPcrId ? 'pcr' : 'extract');
	let form = $state({
		pcr_id: data.preselectedPcrId ?? '', extract_id: data.preselectedExtractId ?? '',
		library_name: '', library_type: '16S_amplicon', library_prep_kit: '', library_prep_date: '',
		platform: '', instrument_model: '', index_sequence_i7: '', index_sequence_i5: '',
		barcode: '', fragment_size_bp: '', final_concentration_ng_ul: '', notes: ''
	});
	let models = $derived(form.platform ? (INSTRUMENT_MODELS[form.platform] || []) : []);

	// Batch mode
	let batchSourceType = $state<'pcr' | 'extract'>('pcr');
	let selectedIds = $state<Set<string>>(new Set());
	let shared = $state({
		library_type: '16S_amplicon', library_prep_kit: '', library_prep_date: '',
		platform: '', instrument_model: '', fragment_size_bp: '', notes: ''
	});
	let batchModels = $derived(shared.platform ? (INSTRUMENT_MODELS[shared.platform] || []) : []);
	type RowItem = { source_id: string; source_name: string; parent_name: string; library_name: string; index_sequence_i7: string; index_sequence_i5: string; barcode: string; final_concentration_ng_ul: string };
	let rows = $state<RowItem[]>([]);

	const batchSources = $derived(batchSourceType === 'pcr' ? data.pcrs : data.extracts);

	function toggleSource(id: string, source_name: string, parent_name: string) {
		if (selectedIds.has(id)) {
			selectedIds.delete(id);
			rows = rows.filter(r => r.source_id !== id);
		} else {
			selectedIds.add(id);
			rows = [...rows, {
				source_id: id, source_name, parent_name,
				library_name: `${source_name}_LIB`,
				index_sequence_i7: '', index_sequence_i5: '', barcode: '', final_concentration_ng_ul: ''
			}];
		}
		selectedIds = new Set(selectedIds);
	}

	function selectAll() { batchSources.forEach((s: { id: string; [key: string]: unknown }) => { if (!selectedIds.has(s.id)) toggleSource(s.id, (s.pcr_name || s.extract_name) as string, (s.extract_name || s.samp_name) as string); }); }
	function clearAll() { selectedIds = new Set(); rows = []; }

	let saving = $state(false);
	let errorMsg = $state('');

	async function submitSingle() {
		const source = sourceType === 'pcr' ? form.pcr_id : form.extract_id;
		if (!source || !form.library_name.trim()) { errorMsg = 'Source and library name are required'; return; }
		saving = true; errorMsg = '';
		const body = {
			...form,
			pcr_id: sourceType === 'pcr' ? form.pcr_id : null,
			extract_id: sourceType === 'extract' ? form.extract_id : null,
			fragment_size_bp: form.fragment_size_bp ? +form.fragment_size_bp : null,
			final_concentration_ng_ul: form.final_concentration_ng_ul ? +form.final_concentration_ng_ul : null
		};
		const res = await fetch('/api/libraries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (res.ok) { const l = await res.json(); goto(`/libraries/${l.id}`); }
		else { errorMsg = 'Failed to create library'; saving = false; }
	}

	async function submitBatch() {
		if (rows.length === 0) { errorMsg = 'Select at least one source'; return; }
		if (rows.some(r => !r.library_name.trim())) { errorMsg = 'All library names are required'; return; }
		saving = true; errorMsg = '';
		const body = rows.map(r => ({
			pcr_id: batchSourceType === 'pcr' ? r.source_id : null,
			extract_id: batchSourceType === 'extract' ? r.source_id : null,
			library_name: r.library_name,
			...shared,
			fragment_size_bp: shared.fragment_size_bp ? +shared.fragment_size_bp : null,
			index_sequence_i7: r.index_sequence_i7 || null,
			index_sequence_i5: r.index_sequence_i5 || null,
			barcode: r.barcode || null,
			final_concentration_ng_ul: r.final_concentration_ng_ul ? +r.final_concentration_ng_ul : null,
		}));
		const res = await fetch('/api/libraries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (res.ok) { goto('/libraries'); }
		else { errorMsg = 'Failed to create libraries'; saving = false; }
	}

	const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';
	const selectCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500';
	const cellInput = 'w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500';
</script>

<div class="max-w-5xl space-y-6">
	<div>
		<a href="/libraries" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Libraries</a>
		<h1 class="text-2xl font-bold text-white mt-1">New Library Prep</h1>
	</div>

	<div class="flex gap-1 p-1 bg-slate-800 rounded-lg w-fit">
		<button onclick={() => mode = 'single'} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {mode === 'single' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">Single</button>
		<button onclick={() => mode = 'batch'} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {mode === 'batch' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">Batch</button>
	</div>

	{#if errorMsg}<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>{/if}

	{#if mode === 'single'}
	<form onsubmit={(e) => { e.preventDefault(); submitSingle(); }} class="space-y-4">
		<div>
			<label class="block text-sm font-medium text-slate-300 mb-2">Source *</label>
			<div class="flex gap-4 mb-2">
				<label class="flex items-center gap-2 text-sm text-slate-300"><input type="radio" bind:group={sourceType} value="pcr" class="accent-ocean-500" /> PCR Product</label>
				<label class="flex items-center gap-2 text-sm text-slate-300"><input type="radio" bind:group={sourceType} value="extract" class="accent-ocean-500" /> Direct from Extract</label>
			</div>
			{#if sourceType === 'pcr'}
				<select bind:value={form.pcr_id} class={selectCls}>
					<option value="">Select PCR...</option>
					{#each data.pcrs as p}<option value={p.id}>{p.pcr_name} ({p.target_gene}) - {p.extract_name}</option>{/each}
				</select>
			{:else}
				<select bind:value={form.extract_id} class={selectCls}>
					<option value="">Select extract...</option>
					{#each data.extracts as e}<option value={e.id}>{e.extract_name} ({e.samp_name})</option>{/each}
				</select>
			{/if}
		</div>
		<div class="grid grid-cols-3 gap-4">
			<div><label for="library_name" class="block text-sm font-medium text-slate-300 mb-1">Library Name *</label>
				<input id="library_name" type="text" bind:value={form.library_name} class={inputCls} placeholder="e.g., LIB-001" /></div>
			<div><label for="library_type" class="block text-sm font-medium text-slate-300 mb-1">Type *</label>
				<select id="library_type" bind:value={form.library_type} class={selectCls}>
					{#each LIBRARY_TYPES as t}<option value={t.value}>{t.label}</option>{/each}
				</select></div>
			<div><label for="library_prep_date" class="block text-sm font-medium text-slate-300 mb-1">Prep Date</label>
				<input id="library_prep_date" type="date" bind:value={form.library_prep_date} class={inputCls} /></div>
		</div>
		<div class="grid grid-cols-2 gap-4">
			<div><label for="platform" class="block text-sm font-medium text-slate-300 mb-1">Platform</label>
				<select id="platform" bind:value={form.platform} class={selectCls}>
					<option value="">Select...</option>
					{#each SEQUENCING_PLATFORMS as p}<option value={p.value}>{p.label}</option>{/each}
				</select></div>
			<div><label for="instrument_model" class="block text-sm font-medium text-slate-300 mb-1">Instrument</label>
				<select id="instrument_model" bind:value={form.instrument_model} class={selectCls}>
					<option value="">Select...</option>
					{#each models as m}<option>{m}</option>{/each}
				</select></div>
		</div>
		<div><label for="library_prep_kit" class="block text-sm font-medium text-slate-300 mb-1">Prep Kit</label>
			<input id="library_prep_kit" type="text" bind:value={form.library_prep_kit} class={inputCls} placeholder="e.g., NEBNext Ultra II" /></div>
		<div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
			<div><label class="block text-sm font-medium text-slate-300 mb-1">i7 Index</label>
				<input type="text" bind:value={form.index_sequence_i7} class="{inputCls} font-mono text-xs" /></div>
			<div><label class="block text-sm font-medium text-slate-300 mb-1">i5 Index</label>
				<input type="text" bind:value={form.index_sequence_i5} class="{inputCls} font-mono text-xs" /></div>
			<div><label class="block text-sm font-medium text-slate-300 mb-1">Fragment (bp)</label>
				<input type="number" bind:value={form.fragment_size_bp} class={inputCls} /></div>
			<div><label class="block text-sm font-medium text-slate-300 mb-1">Conc. ng/µL</label>
				<input type="number" step="any" bind:value={form.final_concentration_ng_ul} class={inputCls} /></div>
		</div>
		<div><label class="block text-sm font-medium text-slate-300 mb-1">Notes</label>
			<textarea bind:value={form.notes} rows="2" class={inputCls}></textarea></div>
		<div class="flex gap-3 pt-2">
			<button type="submit" disabled={saving} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">{saving ? 'Creating...' : 'Create Library'}</button>
			<a href="/libraries" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</a>
		</div>
	</form>

	{:else}
	<!-- Batch mode -->
	<div>
		<label class="block text-sm font-medium text-slate-300 mb-2">Source Type</label>
		<div class="flex gap-4">
			<label class="flex items-center gap-2 text-sm text-slate-300"><input type="radio" bind:group={batchSourceType} value="pcr" onchange={clearAll} class="accent-ocean-500" /> PCR Products</label>
			<label class="flex items-center gap-2 text-sm text-slate-300"><input type="radio" bind:group={batchSourceType} value="extract" onchange={clearAll} class="accent-ocean-500" /> Direct from Extracts</label>
		</div>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
		<!-- Source picker -->
		<div class="space-y-2">
			<div class="flex items-center justify-between">
				<span class="text-sm font-semibold text-slate-300">Select {batchSourceType === 'pcr' ? 'PCRs' : 'Extracts'}</span>
				<div class="flex gap-2">
					<button onclick={selectAll} class="text-xs text-ocean-400 hover:text-ocean-300">All</button>
					<button onclick={clearAll} class="text-xs text-slate-500 hover:text-slate-300">Clear</button>
				</div>
			</div>
			<div class="space-y-1 max-h-72 overflow-y-auto pr-1">
				{#each batchSources as s}
				{@const sourceName = (s as Record<string,string>).pcr_name || (s as Record<string,string>).extract_name}
				{@const parentName = (s as Record<string,string>).extract_name || (s as Record<string,string>).samp_name}
				<label class="flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors {selectedIds.has(s.id) ? 'bg-ocean-900/40 border border-ocean-700' : 'bg-slate-800/50 border border-transparent hover:bg-slate-800'}">
					<input type="checkbox" checked={selectedIds.has(s.id)} onchange={() => toggleSource(s.id, sourceName, parentName)} class="mt-0.5 accent-ocean-500" />
					<div>
						<div class="text-sm text-white">{sourceName}</div>
						<div class="text-xs text-slate-500">{parentName}</div>
					</div>
				</label>
				{/each}
			</div>
			<p class="text-xs text-slate-500">{selectedIds.size} selected</p>
		</div>

		<!-- Shared fields -->
		<div class="lg:col-span-2 space-y-4">
			<p class="text-sm font-semibold text-slate-300">Shared Fields <span class="font-normal text-slate-500">(applied to all)</span></p>
			<div class="grid grid-cols-2 gap-4">
				<div><label class="block text-xs font-medium text-slate-400 mb-1">Library Type</label>
					<select bind:value={shared.library_type} class={selectCls}>
						{#each LIBRARY_TYPES as t}<option value={t.value}>{t.label}</option>{/each}
					</select></div>
				<div><label class="block text-xs font-medium text-slate-400 mb-1">Prep Date</label>
					<input type="date" bind:value={shared.library_prep_date} class={inputCls} /></div>
				<div><label class="block text-xs font-medium text-slate-400 mb-1">Platform</label>
					<select bind:value={shared.platform} class={selectCls}>
						<option value="">Select...</option>
						{#each SEQUENCING_PLATFORMS as p}<option value={p.value}>{p.label}</option>{/each}
					</select></div>
				<div><label class="block text-xs font-medium text-slate-400 mb-1">Instrument</label>
					<select bind:value={shared.instrument_model} class={selectCls}>
						<option value="">Select...</option>
						{#each batchModels as m}<option>{m}</option>{/each}
					</select></div>
				<div><label class="block text-xs font-medium text-slate-400 mb-1">Prep Kit</label>
					<input type="text" bind:value={shared.library_prep_kit} class={inputCls} placeholder="e.g., NEBNext Ultra II" /></div>
				<div><label class="block text-xs font-medium text-slate-400 mb-1">Fragment Size (bp)</label>
					<input type="number" bind:value={shared.fragment_size_bp} class={inputCls} /></div>
			</div>
			<div><label class="block text-xs font-medium text-slate-400 mb-1">Notes</label>
				<input type="text" bind:value={shared.notes} class={inputCls} /></div>
		</div>
	</div>

	<!-- Per-item table (indices are the key per-sample fields) -->
	{#if rows.length > 0}
	<div class="overflow-x-auto">
		<table class="w-full text-sm">
			<thead>
				<tr class="text-xs text-slate-400 uppercase tracking-wider border-b border-slate-700">
					<th class="text-left pb-2 pr-3 font-medium">Source</th>
					<th class="text-left pb-2 pr-3 font-medium min-w-36">Library Name *</th>
					<th class="text-left pb-2 pr-3 font-medium w-32">i7 Index</th>
					<th class="text-left pb-2 pr-3 font-medium w-32">i5 Index</th>
					<th class="text-left pb-2 pr-3 font-medium w-24">Barcode</th>
					<th class="text-left pb-2 pr-3 font-medium w-24">Conc. ng/µL</th>
					<th class="pb-2 w-8"></th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-800">
				{#each rows as row, i}
				<tr>
					<td class="py-2 pr-3">
						<div class="text-white">{row.source_name}</div>
						<div class="text-xs text-slate-500">{row.parent_name}</div>
					</td>
					<td class="py-2 pr-3"><input type="text" bind:value={rows[i].library_name} class={cellInput} /></td>
					<td class="py-2 pr-3"><input type="text" bind:value={rows[i].index_sequence_i7} class="{cellInput} font-mono text-xs" placeholder="—" /></td>
					<td class="py-2 pr-3"><input type="text" bind:value={rows[i].index_sequence_i5} class="{cellInput} font-mono text-xs" placeholder="—" /></td>
					<td class="py-2 pr-3"><input type="text" bind:value={rows[i].barcode} class={cellInput} placeholder="—" /></td>
					<td class="py-2 pr-3"><input type="number" step="any" bind:value={rows[i].final_concentration_ng_ul} class={cellInput} placeholder="—" /></td>
					<td class="py-2">
						<button onclick={() => toggleSource(row.source_id, row.source_name, row.parent_name)} class="text-slate-600 hover:text-red-400 transition-colors">✕</button>
					</td>
				</tr>
				{/each}
			</tbody>
		</table>
	</div>
	{/if}

	<div class="flex gap-3 pt-2">
		<button onclick={submitBatch} disabled={saving || rows.length === 0} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">
			{saving ? 'Creating...' : `Create ${rows.length} Librar${rows.length !== 1 ? 'ies' : 'y'}`}
		</button>
		<a href="/libraries" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</a>
	</div>
	{/if}
</div>
