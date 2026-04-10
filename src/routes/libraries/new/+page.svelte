<script lang="ts">
	import { goto } from '$app/navigation';
	import PlateView from '$lib/components/PlateView.svelte';
	import type { PageData } from './$types';
	import { inferPlatformFromInstrument } from '$lib/platform-infer';
	let { data }: { data: PageData } = $props();

	let showPlateView = $state(false);
	let plateFormat = $state<8 | 96 | 384>(96);
	let wellAssignments = $state<Record<string, string>>({});

	let sourceType = $state<'pcr_plate' | 'pcr' | 'extract'>(data.preselectedPcrPlateId ? 'pcr_plate' : 'pcr');

	let plate = $state({
		plate_name: '', library_prep_date: '', library_type: '',
		library_prep_kit: '', platform: '', instrument_model: '', notes: ''
	});

	// Platform is inferred from the selected instrument — the user never
	// picks it directly. Falls back to 'other' if the instrument isn't
	// recognized (e.g. a custom picklist entry the operator added).
	const inferredPlatform = $derived(
		inferPlatformFromInstrument(plate.instrument_model) ?? (plate.instrument_model ? 'other' : '')
	);
	$effect(() => {
		plate.platform = inferredPlatform;
	});

	// Source selection
	let selectedPcrPlateId = $state(data.preselectedPcrPlateId || '');
	let selectedIds = $state<Set<string>>(new Set());

	type RowItem = { source_id: string; source_type: 'pcr' | 'extract'; source_name: string; parent_name: string; library_name: string; index_sequence_i7: string; index_sequence_i5: string; barcode: string; final_concentration_ng_ul: string };
	let rows = $state<RowItem[]>([]);

	const plateItems = $derived(
		rows.map((r) => ({
			id: r.source_id,
			label: r.library_name || r.source_name,
			sublabel: r.parent_name
		}))
	);

	// When PCR plate is selected, auto-populate rows from its reactions
	async function loadPcrPlateReactions() {
		if (!selectedPcrPlateId) { rows = []; return; }
		const res = await fetch(`/api/pcr?plate_id=${selectedPcrPlateId}`);
		if (!res.ok) return;
		// Fetch reactions for this plate via the pcr-plates detail
		// We need to get reactions — let's use a simple approach
		const plateInfo = (data.pcrPlates as any[]).find((p: any) => p.id === selectedPcrPlateId);
		if (plateInfo) {
			plate.plate_name = plate.plate_name || `${plateInfo.plate_name}_LIB`;
		}
	}

	async function loadFromPlate() {
		if (!selectedPcrPlateId) return;

		const reactions = await fetch(`/api/pcr?plate_id=${selectedPcrPlateId}`).then(r => r.json());

		const plateInfo = (data.pcrPlates as any[]).find((p: any) => p.id === selectedPcrPlateId);
		if (plateInfo && !plate.plate_name) {
			plate.plate_name = `${plateInfo.plate_name}_LIB`;
		}

		rows = reactions.map((r: any) => ({
			source_id: r.id,
			source_type: 'pcr' as const,
			source_name: r.pcr_name,
			parent_name: r.extract_name || '',
			library_name: `${r.pcr_name}_LIB`,
			index_sequence_i7: '', index_sequence_i5: '', barcode: '', final_concentration_ng_ul: ''
		}));
		selectedIds = new Set(reactions.map((r: any) => r.id));
	}

	const sources = $derived(sourceType === 'pcr' ? data.pcrs : data.extracts);

	function toggleSource(id: string, source_name: string, parent_name: string) {
		if (selectedIds.has(id)) {
			selectedIds.delete(id);
			rows = rows.filter(r => r.source_id !== id);
		} else {
			selectedIds.add(id);
			rows = [...rows, {
				source_id: id,
				source_type: sourceType === 'pcr' ? 'pcr' : 'extract',
				source_name, parent_name,
				library_name: `${source_name}_LIB`,
				index_sequence_i7: '', index_sequence_i5: '', barcode: '', final_concentration_ng_ul: ''
			}];
		}
		selectedIds = new Set(selectedIds);
	}

	function selectAll() {
		(sources as any[]).forEach((s: any) => {
			const name = (s as any).pcr_name || (s as any).extract_name;
			const parent = (s as any).extract_name || (s as any).samp_name;
			if (!selectedIds.has(s.id)) toggleSource(s.id, name, parent);
		});
	}
	function clearAll() { selectedIds = new Set(); rows = []; }

	function onSourceTypeChange() {
		selectedIds = new Set();
		rows = [];
		selectedPcrPlateId = '';
	}

	let saving = $state(false);
	let errorMsg = $state('');

	async function submit() {
		if (!plate.plate_name.trim()) { errorMsg = 'Plate name is required'; return; }
		if (rows.length === 0) { errorMsg = 'Add at least one library'; return; }
		if (rows.some(r => !r.library_name.trim())) { errorMsg = 'All library names are required'; return; }
		saving = true; errorMsg = '';

		const body = {
			...plate,
			pcr_plate_id: sourceType === 'pcr_plate' ? selectedPcrPlateId : null,
			libraries: rows.map(r => ({
				pcr_id: r.source_type === 'pcr' ? r.source_id : null,
				extract_id: r.source_type === 'extract' ? r.source_id : null,
				library_name: r.library_name,
				index_sequence_i7: r.index_sequence_i7 || null,
				index_sequence_i5: r.index_sequence_i5 || null,
				barcode: r.barcode || null,
				final_concentration_ng_ul: r.final_concentration_ng_ul ? +r.final_concentration_ng_ul : null,
			}))
		};
		const res = await fetch('/api/library-plates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (res.ok) { const p = await res.json(); goto(`/libraries/${p.id}`); }
		else {
			const err = await res.json().catch(() => null);
			errorMsg = err?.error || `Failed to create library plate (${res.status})`;
			saving = false;
		}
	}

	const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';
	const selectCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500';
	const cellInput = 'w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500';
</script>

<div class="max-w-5xl space-y-6">
	<div>
		<a href="/libraries" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Library Plates</a>
		<h1 class="text-2xl font-bold text-white mt-1">New Library Plate</h1>
	</div>

	{#if errorMsg}<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>{/if}

	<!-- Source type selector -->
	<div>
		<label class="block text-sm font-medium text-slate-300 mb-2">Source</label>
		<div class="flex gap-4">
			<label class="flex items-center gap-2 text-sm text-slate-300"><input type="radio" bind:group={sourceType} value="pcr_plate" onchange={onSourceTypeChange} class="accent-ocean-500" /> PCR Plate</label>
			<label class="flex items-center gap-2 text-sm text-slate-300"><input type="radio" bind:group={sourceType} value="pcr" onchange={onSourceTypeChange} class="accent-ocean-500" /> Individual PCRs</label>
			<label class="flex items-center gap-2 text-sm text-slate-300"><input type="radio" bind:group={sourceType} value="extract" onchange={onSourceTypeChange} class="accent-ocean-500" /> Direct from Extracts</label>
		</div>
	</div>

	<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
		<!-- Source picker -->
		<div class="space-y-2">
			{#if sourceType === 'pcr_plate'}
			<span class="text-sm font-semibold text-slate-300">Select PCR Plate</span>
			<div class="space-y-1">
				{#each data.pcrPlates as p}
				<label class="flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors {selectedPcrPlateId === p.id ? 'bg-ocean-900/40 border border-ocean-700' : 'bg-slate-800/50 border border-transparent hover:bg-slate-800'}">
					<input type="radio" bind:group={selectedPcrPlateId} value={p.id} class="mt-0.5 accent-ocean-500" />
					<div>
						<div class="text-sm text-white">{p.plate_name}</div>
						<div class="text-xs text-slate-500">{p.target_gene}{p.target_subfragment ? ` ${p.target_subfragment}` : ''} &middot; {p.reaction_count} reactions</div>
					</div>
				</label>
				{/each}
			</div>
			<button onclick={loadFromPlate} disabled={!selectedPcrPlateId} class="mt-2 px-3 py-1.5 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-xs font-medium">
				Load Reactions
			</button>

			{:else}
			<div class="flex items-center justify-between">
				<span class="text-sm font-semibold text-slate-300">Select {sourceType === 'pcr' ? 'PCRs' : 'Extracts'}</span>
				<div class="flex gap-2">
					<button onclick={selectAll} class="text-xs text-ocean-400 hover:text-ocean-300">All</button>
					<button onclick={clearAll} class="text-xs text-slate-500 hover:text-slate-300">Clear</button>
				</div>
			</div>
			<div class="space-y-1 max-h-80 overflow-y-auto pr-1">
				{#each sources as s}
				{@const sourceName = (s as any).pcr_name || (s as any).extract_name}
				{@const parentName = (s as any).extract_name || (s as any).samp_name}
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
			{/if}
		</div>

		<!-- Plate fields -->
		<div class="lg:col-span-2 space-y-4">
			<div class="grid grid-cols-3 gap-4">
				<div><label class="block text-xs font-medium text-slate-400 mb-1">Plate Name</label>
					<input type="text" bind:value={plate.plate_name} class={inputCls} placeholder={data.namingTemplates?.library_plate_name || 'e.g., 16S_LIB_001'} /></div>
				<div><label class="block text-xs font-medium text-slate-400 mb-1">Prep Date</label>
					<input type="date" bind:value={plate.library_prep_date} class={inputCls} /></div>
				<div><label class="block text-xs font-medium text-slate-400 mb-1"><a href="/settings?tab=people" target="_blank" class="hover:text-ocean-400">Prepped By</a></label>
					<select bind:value={plate.prepped_by} class={selectCls}>
						<option value="">Select...</option>
						{#each data.personnel as p}<option value={p.id}>{p.full_name}</option>{/each}
					</select></div>
			</div>
			<div class="grid grid-cols-2 gap-4">
				<div><label class="block text-xs font-medium text-slate-400 mb-1"><a href="/settings?tab=library_type" target="_blank" class="hover:text-ocean-400">Library Type</a></label>
					<select bind:value={plate.library_type} class={selectCls}>
						<option value="">Select...</option>
						{#each data.picklists.library_type as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select></div>
				<div><label class="block text-xs font-medium text-slate-400 mb-1"><a href="/settings?tab=library_prep_kit" target="_blank" class="hover:text-ocean-400">Prep Kit</a></label>
					<select bind:value={plate.library_prep_kit} class={selectCls}>
						<option value="">Select...</option>
						{#each data.picklists.library_prep_kit as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select></div>
			</div>
			<div>
				<label class="block text-xs font-medium text-slate-400 mb-1">
					<a href="/settings?tab=seq_instrument" target="_blank" class="hover:text-ocean-400">Instrument</a>
				</label>
				<select bind:value={plate.instrument_model} class={selectCls}>
					<option value="">Select...</option>
					{#each data.picklists.seq_instrument as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
				{#if inferredPlatform}
					<p class="text-xs text-slate-500 mt-1">
						Platform: <span class="text-slate-300">{inferredPlatform}</span>
						<span class="text-slate-600">(inferred)</span>
					</p>
				{/if}
			</div>
			<div><label class="block text-xs font-medium text-slate-400 mb-1">Notes</label>
				<input type="text" bind:value={plate.notes} class={inputCls} /></div>
		</div>
	</div>

	<!-- Plate layout (collapsible) -->
	{#if rows.length > 0}
	<div class="rounded-lg border border-slate-800 bg-slate-900/30">
		<button
			type="button"
			onclick={() => (showPlateView = !showPlateView)}
			class="w-full flex items-center justify-between px-4 py-2 text-sm text-slate-300 hover:text-white"
		>
			<span class="font-semibold">Plate layout</span>
			<span class="text-xs text-slate-500">{showPlateView ? '▾' : '▸'}</span>
		</button>
		{#if showPlateView}
			<div class="p-4 border-t border-slate-800">
				<PlateView items={plateItems} bind:wellAssignments bind:format={plateFormat} />
			</div>
		{/if}
	</div>
	{/if}

	<!-- Per-library table -->
	{#if rows.length > 0}
	<div class="overflow-x-auto">
		<p class="text-sm font-semibold text-slate-300 mb-2">Libraries ({rows.length})</p>
		<table class="w-full text-sm">
			<thead>
				<tr class="text-xs text-slate-400 uppercase tracking-wider border-b border-slate-700">
					<th class="text-left pb-2 pr-3 font-medium">Source</th>
					<th class="text-left pb-2 pr-3 font-medium min-w-36">Library Name</th>
					<th class="text-left pb-2 pr-3 font-medium w-36"><a href="/settings?tab=index_i7" target="_blank" class="hover:text-ocean-400">i7 Index</a></th>
					<th class="text-left pb-2 pr-3 font-medium w-36"><a href="/settings?tab=index_i5" target="_blank" class="hover:text-ocean-400">i5 Index</a></th>
					<th class="text-left pb-2 pr-3 font-medium w-24"><a href="/settings?tab=barcode" target="_blank" class="hover:text-ocean-400">Barcode</a></th>
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
					<td class="py-2 pr-3">
						<select bind:value={rows[i].index_sequence_i7} class="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-xs focus:outline-none focus:border-ocean-500">
							<option value="">--</option>
							{#each data.picklists.index_i7 as opt}<option value={opt.value}>{opt.label}</option>{/each}
						</select></td>
					<td class="py-2 pr-3">
						<select bind:value={rows[i].index_sequence_i5} class="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-xs focus:outline-none focus:border-ocean-500">
							<option value="">--</option>
							{#each data.picklists.index_i5 as opt}<option value={opt.value}>{opt.label}</option>{/each}
						</select></td>
					<td class="py-2 pr-3">
						<select bind:value={rows[i].barcode} class="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-xs focus:outline-none focus:border-ocean-500">
							<option value="">--</option>
							{#each data.picklists.barcode as opt}<option value={opt.value}>{opt.label}</option>{/each}
						</select></td>
					<td class="py-2 pr-3"><input type="number" step="any" bind:value={rows[i].final_concentration_ng_ul} class={cellInput} placeholder="--" /></td>
					<td class="py-2">
						<button onclick={() => { selectedIds.delete(row.source_id); selectedIds = new Set(selectedIds); rows = rows.filter(r => r.source_id !== row.source_id); }} class="text-slate-600 hover:text-red-400 transition-colors">✕</button>
					</td>
				</tr>
				{/each}
			</tbody>
		</table>
	</div>
	{/if}

	<div class="flex gap-3 pt-2">
		<button onclick={submit} disabled={saving || rows.length === 0} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">
			{saving ? 'Creating...' : `Create Plate (${rows.length} librar${rows.length !== 1 ? 'ies' : 'y'})`}
		</button>
		<a href="/libraries" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</a>
	</div>
</div>
