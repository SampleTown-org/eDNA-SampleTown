<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	let mode = $state<'single' | 'batch'>('single');

	// Single mode
	let form = $state({
		extract_id: data.preselectedExtractId ?? '', pcr_name: '', target_gene: '16S', target_subfragment: '',
		forward_primer_name: '', forward_primer_seq: '', reverse_primer_name: '', reverse_primer_seq: '',
		pcr_conditions: '', annealing_temp_c: '', num_cycles: '', polymerase: '', pcr_date: '',
		band_observed: '', concentration_ng_ul: '', notes: ''
	});

	// Batch mode
	let selectedExtractIds = $state<Set<string>>(new Set());
	let shared = $state({
		target_gene: '16S', target_subfragment: '',
		forward_primer_name: '', forward_primer_seq: '', reverse_primer_name: '', reverse_primer_seq: '',
		pcr_conditions: '', annealing_temp_c: '', num_cycles: '', polymerase: '', pcr_date: '', notes: ''
	});
	type RowItem = { extract_id: string; extract_name: string; samp_name: string; pcr_name: string; band_observed: string; concentration_ng_ul: string };
	let rows = $state<RowItem[]>([]);

	function toggleExtract(id: string, extract_name: string, samp_name: string) {
		if (selectedExtractIds.has(id)) {
			selectedExtractIds.delete(id);
			rows = rows.filter(r => r.extract_id !== id);
		} else {
			selectedExtractIds.add(id);
			rows = [...rows, {
				extract_id: id, extract_name, samp_name,
				pcr_name: `${extract_name}_${shared.target_gene || 'PCR'}`,
				band_observed: '', concentration_ng_ul: ''
			}];
		}
		selectedExtractIds = new Set(selectedExtractIds);
	}

	// Update auto-generated PCR names when target gene changes
	$effect(() => {
		rows = rows.map(r => ({
			...r,
			pcr_name: r.pcr_name === `${r.extract_name}_${shared.target_gene}` || !r.pcr_name
				? `${r.extract_name}_${shared.target_gene || 'PCR'}`
				: r.pcr_name
		}));
	});

	function selectAll() { data.extracts.forEach(e => { if (!selectedExtractIds.has(e.id)) toggleExtract(e.id, e.extract_name, e.samp_name); }); }
	function clearAll() { selectedExtractIds = new Set(); rows = []; }

	let saving = $state(false);
	let errorMsg = $state('');

	async function submitSingle() {
		if (!form.extract_id || !form.pcr_name.trim()) { errorMsg = 'Extract and PCR name are required'; return; }
		saving = true; errorMsg = '';
		const body = { ...form,
			annealing_temp_c: form.annealing_temp_c ? +form.annealing_temp_c : null,
			num_cycles: form.num_cycles ? +form.num_cycles : null,
			band_observed: form.band_observed === '' ? null : +form.band_observed,
			concentration_ng_ul: form.concentration_ng_ul ? +form.concentration_ng_ul : null };
		const res = await fetch('/api/pcr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (res.ok) { const p = await res.json(); goto(`/pcr/${p.id}`); }
		else { errorMsg = 'Failed to create PCR'; saving = false; }
	}

	async function submitBatch() {
		if (rows.length === 0) { errorMsg = 'Select at least one extract'; return; }
		if (rows.some(r => !r.pcr_name.trim())) { errorMsg = 'All PCR names are required'; return; }
		saving = true; errorMsg = '';
		const body = rows.map(r => ({
			extract_id: r.extract_id,
			pcr_name: r.pcr_name,
			...shared,
			annealing_temp_c: shared.annealing_temp_c ? +shared.annealing_temp_c : null,
			num_cycles: shared.num_cycles ? +shared.num_cycles : null,
			band_observed: r.band_observed === '' ? null : +r.band_observed,
			concentration_ng_ul: r.concentration_ng_ul ? +r.concentration_ng_ul : null,
		}));
		const res = await fetch('/api/pcr', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (res.ok) { goto('/pcr'); }
		else { errorMsg = 'Failed to create PCRs'; saving = false; }
	}

	const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';
	const selectCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500';
	const cellInput = 'w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500';
	const monoInput = cellInput + ' font-mono text-xs';
</script>

<div class="max-w-5xl space-y-6">
	<div>
		<a href="/pcr" class="text-sm text-slate-400 hover:text-ocean-400">&larr; PCR</a>
		<h1 class="text-2xl font-bold text-white mt-1">New PCR Amplification</h1>
	</div>

	<div class="flex gap-1 p-1 bg-slate-800 rounded-lg w-fit">
		<button onclick={() => mode = 'single'} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {mode === 'single' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">Single</button>
		<button onclick={() => mode = 'batch'} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {mode === 'batch' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">Batch</button>
	</div>

	{#if errorMsg}<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>{/if}

	{#if mode === 'single'}
	<form onsubmit={(e) => { e.preventDefault(); submitSingle(); }} class="space-y-4">
		<div><label for="extract_id" class="block text-sm font-medium text-slate-300 mb-1">Source Extract *</label>
			<select id="extract_id" bind:value={form.extract_id} class={selectCls}>
				<option value="">Select extract...</option>
				{#each data.extracts as e}<option value={e.id}>{e.extract_name} ({e.samp_name})</option>{/each}
			</select></div>
		<div class="grid grid-cols-3 gap-4">
			<div><label for="pcr_name" class="block text-sm font-medium text-slate-300 mb-1">PCR Name *</label>
				<input id="pcr_name" type="text" bind:value={form.pcr_name} class={inputCls} placeholder="e.g., PCR-001" /></div>
			<div><label for="target_gene" class="block text-sm font-medium text-slate-300 mb-1">Target Gene *</label>
				<select id="target_gene" bind:value={form.target_gene} class={selectCls}>
					<option>16S</option><option>18S</option><option>CO1</option><option>12S</option><option>ITS</option><option>other</option>
				</select></div>
			<div><label for="target_subfragment" class="block text-sm font-medium text-slate-300 mb-1">Region</label>
				<input id="target_subfragment" type="text" bind:value={form.target_subfragment} class={inputCls} placeholder="e.g., V4" /></div>
		</div>
		<fieldset class="space-y-4">
			<legend class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Primers</legend>
			<div class="grid grid-cols-2 gap-4">
				<div><label class="block text-sm font-medium text-slate-300 mb-1">Forward Name</label>
					<input type="text" bind:value={form.forward_primer_name} class={inputCls} placeholder="e.g., 515F" /></div>
				<div><label class="block text-sm font-medium text-slate-300 mb-1">Forward Sequence</label>
					<input type="text" bind:value={form.forward_primer_seq} class="{inputCls} font-mono text-xs" placeholder="GTGYCAGCMGCCGCGGTAA" /></div>
				<div><label class="block text-sm font-medium text-slate-300 mb-1">Reverse Name</label>
					<input type="text" bind:value={form.reverse_primer_name} class={inputCls} placeholder="e.g., 806R" /></div>
				<div><label class="block text-sm font-medium text-slate-300 mb-1">Reverse Sequence</label>
					<input type="text" bind:value={form.reverse_primer_seq} class="{inputCls} font-mono text-xs" placeholder="GGACTACNVGGGTWTCTAAT" /></div>
			</div>
		</fieldset>
		<div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
			<div><label class="block text-sm font-medium text-slate-300 mb-1">Anneal °C</label>
				<input type="number" step="any" bind:value={form.annealing_temp_c} class={inputCls} /></div>
			<div><label class="block text-sm font-medium text-slate-300 mb-1">Cycles</label>
				<input type="number" bind:value={form.num_cycles} class={inputCls} /></div>
			<div><label class="block text-sm font-medium text-slate-300 mb-1">Date</label>
				<input type="date" bind:value={form.pcr_date} class={inputCls} /></div>
			<div><label class="block text-sm font-medium text-slate-300 mb-1">Conc. ng/µL</label>
				<input type="number" step="any" bind:value={form.concentration_ng_ul} class={inputCls} /></div>
		</div>
		<div><label class="block text-sm font-medium text-slate-300 mb-1">Notes</label>
			<textarea bind:value={form.notes} rows="2" class={inputCls}></textarea></div>
		<div class="flex gap-3 pt-2">
			<button type="submit" disabled={saving} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">{saving ? 'Creating...' : 'Create PCR'}</button>
			<a href="/pcr" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</a>
		</div>
	</form>

	{:else}
	<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
		<!-- Extract picker -->
		<div class="space-y-2">
			<div class="flex items-center justify-between">
				<span class="text-sm font-semibold text-slate-300">Select Extracts</span>
				<div class="flex gap-2">
					<button onclick={selectAll} class="text-xs text-ocean-400 hover:text-ocean-300">All</button>
					<button onclick={clearAll} class="text-xs text-slate-500 hover:text-slate-300">Clear</button>
				</div>
			</div>
			<div class="space-y-1 max-h-72 overflow-y-auto pr-1">
				{#each data.extracts as e}
				<label class="flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors {selectedExtractIds.has(e.id) ? 'bg-ocean-900/40 border border-ocean-700' : 'bg-slate-800/50 border border-transparent hover:bg-slate-800'}">
					<input type="checkbox" checked={selectedExtractIds.has(e.id)} onchange={() => toggleExtract(e.id, e.extract_name, e.samp_name)} class="mt-0.5 accent-ocean-500" />
					<div>
						<div class="text-sm text-white">{e.extract_name}</div>
						<div class="text-xs text-slate-500">{e.samp_name}</div>
					</div>
				</label>
				{/each}
			</div>
			<p class="text-xs text-slate-500">{selectedExtractIds.size} selected</p>
		</div>

		<!-- Shared fields -->
		<div class="lg:col-span-2 space-y-4">
			<p class="text-sm font-semibold text-slate-300">Shared Fields <span class="font-normal text-slate-500">(applied to all)</span></p>
			<div class="grid grid-cols-3 gap-4">
				<div><label class="block text-xs font-medium text-slate-400 mb-1">Target Gene</label>
					<select bind:value={shared.target_gene} class={selectCls}>
						<option>16S</option><option>18S</option><option>CO1</option><option>12S</option><option>ITS</option><option>other</option>
					</select></div>
				<div><label class="block text-xs font-medium text-slate-400 mb-1">Region</label>
					<input type="text" bind:value={shared.target_subfragment} class={inputCls} placeholder="e.g., V4" /></div>
				<div><label class="block text-xs font-medium text-slate-400 mb-1">Date</label>
					<input type="date" bind:value={shared.pcr_date} class={inputCls} /></div>
			</div>
			<div class="grid grid-cols-2 gap-4">
				<div><label class="block text-xs font-medium text-slate-400 mb-1">Forward Primer Name</label>
					<input type="text" bind:value={shared.forward_primer_name} class={inputCls} placeholder="e.g., 515F" /></div>
				<div><label class="block text-xs font-medium text-slate-400 mb-1">Forward Sequence</label>
					<input type="text" bind:value={shared.forward_primer_seq} class="{inputCls} font-mono text-xs" placeholder="GTGYCAGCMGCCGCGGTAA" /></div>
				<div><label class="block text-xs font-medium text-slate-400 mb-1">Reverse Primer Name</label>
					<input type="text" bind:value={shared.reverse_primer_name} class={inputCls} placeholder="e.g., 806R" /></div>
				<div><label class="block text-xs font-medium text-slate-400 mb-1">Reverse Sequence</label>
					<input type="text" bind:value={shared.reverse_primer_seq} class="{inputCls} font-mono text-xs" placeholder="GGACTACNVGGGTWTCTAAT" /></div>
			</div>
			<div class="grid grid-cols-3 gap-4">
				<div><label class="block text-xs font-medium text-slate-400 mb-1">Anneal °C</label>
					<input type="number" step="any" bind:value={shared.annealing_temp_c} class={inputCls} /></div>
				<div><label class="block text-xs font-medium text-slate-400 mb-1">Cycles</label>
					<input type="number" bind:value={shared.num_cycles} class={inputCls} /></div>
				<div><label class="block text-xs font-medium text-slate-400 mb-1">Polymerase</label>
					<input type="text" bind:value={shared.polymerase} class={inputCls} placeholder="e.g., Phusion" /></div>
			</div>
			<div><label class="block text-xs font-medium text-slate-400 mb-1">Notes</label>
				<input type="text" bind:value={shared.notes} class={inputCls} /></div>
		</div>
	</div>

	{#if rows.length > 0}
	<div class="overflow-x-auto">
		<table class="w-full text-sm">
			<thead>
				<tr class="text-xs text-slate-400 uppercase tracking-wider border-b border-slate-700">
					<th class="text-left pb-2 pr-3 font-medium">Extract</th>
					<th class="text-left pb-2 pr-3 font-medium min-w-36">PCR Name *</th>
					<th class="text-left pb-2 pr-3 font-medium w-24">Band</th>
					<th class="text-left pb-2 pr-3 font-medium w-28">Conc. ng/µL</th>
					<th class="pb-2 w-8"></th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-800">
				{#each rows as row, i}
				<tr>
					<td class="py-2 pr-3">
						<div class="text-white">{row.extract_name}</div>
						<div class="text-xs text-slate-500">{row.samp_name}</div>
					</td>
					<td class="py-2 pr-3"><input type="text" bind:value={rows[i].pcr_name} class={cellInput} /></td>
					<td class="py-2 pr-3">
						<select bind:value={rows[i].band_observed} class="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500">
							<option value="">—</option><option value="1">Yes</option><option value="0">No</option>
						</select>
					</td>
					<td class="py-2 pr-3"><input type="number" step="any" bind:value={rows[i].concentration_ng_ul} class={cellInput} placeholder="—" /></td>
					<td class="py-2">
						<button onclick={() => toggleExtract(row.extract_id, row.extract_name, row.samp_name)} class="text-slate-600 hover:text-red-400 transition-colors">✕</button>
					</td>
				</tr>
				{/each}
			</tbody>
		</table>
	</div>
	{/if}

	<div class="flex gap-3 pt-2">
		<button onclick={submitBatch} disabled={saving || rows.length === 0} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">
			{saving ? 'Creating...' : `Create ${rows.length} PCR${rows.length !== 1 ? 's' : ''}`}
		</button>
		<a href="/pcr" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</a>
	</div>
	{/if}
</div>
