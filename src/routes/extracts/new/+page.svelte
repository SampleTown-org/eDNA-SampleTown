<script lang="ts">
	import { goto } from '$app/navigation';
	import PeoplePicker from '$lib/components/PeoplePicker.svelte';
	import { cart } from '$lib/stores/cart.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	let people = $state<{ personnel_id: string; role?: string | null }[]>([]);

	// If the cart has samples, auto-switch to batch mode and pre-populate.
	const cartSamples = cart.getByType('sample');
	const hasCartSamples = cartSamples.length > 0;

	let mode = $state<'single' | 'batch'>(
		hasCartSamples ? 'batch' : (data.preselectedSampleId ? 'single' : 'single')
	);

	// Single mode
	let form = $state({
		sample_id: data.preselectedSampleId ?? '',
		extract_name: '', extraction_date: '', extraction_method: '', extraction_kit: '',
		concentration_ng_ul: '', total_volume_ul: '', a260_280: '', a260_230: '',
		quantification_method: '', storage_room: '', storage_box: '', notes: ''
	});

	// Batch mode
	let selectedSampleIds = $state<Set<string>>(new Set());
	let shared = $state({
		extraction_date: '', extraction_method: '', extraction_kit: '',
		quantification_method: '', storage_room: '', storage_box: '', notes: ''
	});
	type RowItem = { sample_id: string; samp_name: string; project_name: string; extract_name: string; concentration_ng_ul: string; total_volume_ul: string; a260_280: string; a260_230: string };
	let rows = $state<RowItem[]>([]);

	// Pre-populate from cart on mount
	if (hasCartSamples) {
		const sampleMap = new Map((data.samples as any[]).map((s: any) => [s.id, s]));
		for (const ci of cartSamples) {
			const s = sampleMap.get(ci.id);
			if (!s) continue;
			selectedSampleIds.add(s.id);
			rows.push({
				sample_id: s.id, samp_name: s.samp_name, project_name: s.project_name,
				extract_name: `${s.samp_name}_EXT`,
				concentration_ng_ul: '', total_volume_ul: '', a260_280: '', a260_230: ''
			});
		}
		selectedSampleIds = new Set(selectedSampleIds);
	}

	function toggleSample(id: string, samp_name: string, project_name: string) {
		if (selectedSampleIds.has(id)) {
			selectedSampleIds.delete(id);
			rows = rows.filter(r => r.sample_id !== id);
		} else {
			selectedSampleIds.add(id);
			const existing = rows.filter(r => r.sample_id !== id);
			const idx = existing.length + 1;
			rows = [...existing, {
				sample_id: id, samp_name, project_name,
				extract_name: `${samp_name}_EXT`,
				concentration_ng_ul: '', total_volume_ul: '', a260_280: '', a260_230: ''
			}];
		}
		selectedSampleIds = new Set(selectedSampleIds);
	}

	function selectAll() {
		data.samples.forEach(s => {
			if (!selectedSampleIds.has(s.id)) toggleSample(s.id, s.samp_name, s.project_name);
		});
	}
	function clearAll() {
		selectedSampleIds = new Set();
		rows = [];
	}

	let saving = $state(false);
	let errorMsg = $state('');

	async function submitSingle() {
		if (!form.sample_id || !form.extract_name.trim()) { errorMsg = 'Sample and extract name are required'; return; }
		saving = true; errorMsg = '';
		const body = { ...form, people,
			concentration_ng_ul: form.concentration_ng_ul ? +form.concentration_ng_ul : null,
			total_volume_ul: form.total_volume_ul ? +form.total_volume_ul : null,
			a260_280: form.a260_280 ? +form.a260_280 : null, a260_230: form.a260_230 ? +form.a260_230 : null };
		const res = await fetch('/api/extracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (res.ok) { cart.clearType('sample'); const e = await res.json(); goto(`/extracts/${e.id}`); }
		else { errorMsg = 'Failed to create extract'; saving = false; }
	}

	async function submitBatch() {
		if (rows.length === 0) { errorMsg = 'Select at least one sample'; return; }
		if (rows.some(r => !r.extract_name.trim())) { errorMsg = 'All extract names are required'; return; }
		saving = true; errorMsg = '';
		const body = rows.map(r => ({
			sample_id: r.sample_id,
			extract_name: r.extract_name,
			...shared,
			people,
			concentration_ng_ul: r.concentration_ng_ul ? +r.concentration_ng_ul : null,
			total_volume_ul: r.total_volume_ul ? +r.total_volume_ul : null,
			a260_280: r.a260_280 ? +r.a260_280 : null,
			a260_230: r.a260_230 ? +r.a260_230 : null,
		}));
		const res = await fetch('/api/extracts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (res.ok) { cart.clearType('sample'); goto('/extracts'); }
		else { errorMsg = 'Failed to create extracts'; saving = false; }
	}

	const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';
	const selectCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500';
	const cellInput = 'w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500';
</script>

<div class="max-w-5xl space-y-6">
	<div>
		<a href="/extracts" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Extracts</a>
		<h1 class="text-2xl font-bold text-white mt-1">New DNA Extract</h1>
	</div>

	<!-- Mode toggle -->
	<div class="flex gap-1 p-1 bg-slate-800 rounded-lg w-fit">
		<button onclick={() => mode = 'single'} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {mode === 'single' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">Single</button>
		<button onclick={() => mode = 'batch'} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {mode === 'batch' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">Batch</button>
	</div>

	{#if hasCartSamples}
		<div class="p-3 rounded-lg bg-ocean-900/20 border border-ocean-800 text-ocean-300 text-sm flex items-center justify-between">
			<span>Pre-filled {cartSamples.length} sample{cartSamples.length === 1 ? '' : 's'} from cart</span>
			<button onclick={() => { cart.clearType('sample'); rows = []; selectedSampleIds = new Set(); }} class="text-xs text-slate-400 hover:text-white">Clear</button>
		</div>
	{/if}

	{#if errorMsg}<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>{/if}

	{#if mode === 'single'}
	<form onsubmit={(e) => { e.preventDefault(); submitSingle(); }} class="space-y-4">
		<div>
			<label for="sample_id" class="block text-sm font-medium text-slate-300 mb-1">Source Sample *</label>
			<select id="sample_id" bind:value={form.sample_id} class={selectCls}>
				<option value="">Select sample...</option>
				{#each data.samples as s}<option value={s.id}>{s.samp_name} ({s.project_name})</option>{/each}
			</select>
		</div>
		<div class="grid grid-cols-3 gap-4">
			<div><label for="extract_name" class="block text-sm font-medium text-slate-300 mb-1">Extract Name *</label>
				<input id="extract_name" type="text" bind:value={form.extract_name} class={inputCls} placeholder={data.namingTemplates?.extract_name || 'e.g., EXT-001'} /></div>
			<div><label for="extraction_date" class="block text-sm font-medium text-slate-300 mb-1">Extraction Date</label>
				<input id="extraction_date" type="date" bind:value={form.extraction_date} class={inputCls} /></div>
			<div></div>
		</div>
		<PeoplePicker
			bind:people
			personnel={data.personnel}
			roleOptions={data.picklists.person_role}
			defaultRole="extractor"
			label="People"
		/>
		<div class="grid grid-cols-2 gap-4">
			<div><label for="extraction_method" class="block text-sm font-medium text-slate-300 mb-1"><a href="/settings?tab=extraction_method" target="_blank" class="hover:text-ocean-400">Method</a></label>
				<select id="extraction_method" bind:value={form.extraction_method} class={selectCls}>
					<option value="">Select...</option>
					{#each data.picklists.extraction_method as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select></div>
			<div><label for="extraction_kit" class="block text-sm font-medium text-slate-300 mb-1"><a href="/settings?tab=extraction_kit" target="_blank" class="hover:text-ocean-400">Kit</a></label>
				<select id="extraction_kit" bind:value={form.extraction_kit} class={selectCls}>
					<option value="">Select...</option>
					{#each data.picklists.extraction_kit as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select></div>
		</div>
		<div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
			<div><label for="concentration_ng_ul" class="block text-sm font-medium text-slate-300 mb-1">Conc. (ng/µL)</label>
				<input id="concentration_ng_ul" type="number" step="any" bind:value={form.concentration_ng_ul} class={inputCls} /></div>
			<div><label for="total_volume_ul" class="block text-sm font-medium text-slate-300 mb-1">Volume (µL)</label>
				<input id="total_volume_ul" type="number" step="any" bind:value={form.total_volume_ul} class={inputCls} /></div>
			<div><label for="a260_280" class="block text-sm font-medium text-slate-300 mb-1">260/280</label>
				<input id="a260_280" type="number" step="any" bind:value={form.a260_280} class={inputCls} /></div>
			<div><label for="a260_230" class="block text-sm font-medium text-slate-300 mb-1">260/230</label>
				<input id="a260_230" type="number" step="any" bind:value={form.a260_230} class={inputCls} /></div>
		</div>
		<div class="grid grid-cols-3 gap-4">
			<div><label for="quantification_method" class="block text-sm font-medium text-slate-300 mb-1">Quantification</label>
				<select id="quantification_method" bind:value={form.quantification_method} class={selectCls}>
					<option value="">Select...</option><option>Qubit</option><option>NanoDrop</option><option>Bioanalyzer</option><option>Other</option>
				</select></div>
			<div><label class="block text-sm font-medium text-slate-300 mb-1"><a href="/settings?tab=storage_room" target="_blank" class="hover:text-ocean-400">Room/Freezer</a></label>
				<select bind:value={form.storage_room} class={selectCls}>
					<option value="">Select...</option>
					{#each data.picklists.storage_room as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select></div>
			<div><label class="block text-sm font-medium text-slate-300 mb-1"><a href="/settings?tab=storage_box" target="_blank" class="hover:text-ocean-400">Storage Box</a></label>
				<select bind:value={form.storage_box} class={selectCls}>
					<option value="">Select...</option>
					{#each data.picklists.storage_box as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select></div>
		</div>
		<div><label for="notes" class="block text-sm font-medium text-slate-300 mb-1">Notes</label>
			<textarea id="notes" bind:value={form.notes} rows="2" class={inputCls}></textarea></div>
		<div class="flex gap-3 pt-2">
			<button type="submit" disabled={saving} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">{saving ? 'Creating...' : 'Create Extract'}</button>
			<a href="/extracts" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</a>
		</div>
	</form>

	{:else}
	<!-- Batch mode -->
	<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
		<!-- Left: sample picker -->
		<div class="space-y-2">
			<div class="flex items-center justify-between">
				<span class="text-sm font-semibold text-slate-300">Select Samples</span>
				<div class="flex gap-2">
					<button onclick={selectAll} class="text-xs text-ocean-400 hover:text-ocean-300">All</button>
					<button onclick={clearAll} class="text-xs text-slate-500 hover:text-slate-300">Clear</button>
				</div>
			</div>
			<div class="space-y-1 max-h-72 overflow-y-auto pr-1">
				{#each data.samples as s}
				<label class="flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors {selectedSampleIds.has(s.id) ? 'bg-ocean-900/40 border border-ocean-700' : 'bg-slate-800/50 border border-transparent hover:bg-slate-800'}">
					<input type="checkbox" checked={selectedSampleIds.has(s.id)} onchange={() => toggleSample(s.id, s.samp_name, s.project_name)} class="mt-0.5 accent-ocean-500" />
					<div>
						<div class="text-sm text-white">{s.samp_name}</div>
						<div class="text-xs text-slate-500">{s.project_name}</div>
					</div>
				</label>
				{/each}
			</div>
			<p class="text-xs text-slate-500">{selectedSampleIds.size} selected</p>
		</div>

		<!-- Right: shared fields -->
		<div class="lg:col-span-2 space-y-4">
			<p class="text-sm font-semibold text-slate-300">Shared Fields <span class="font-normal text-slate-500">(applied to all)</span></p>
			<div class="grid grid-cols-2 gap-4">
				<div><label class="block text-xs font-medium text-slate-400 mb-1">Extraction Date</label>
					<input type="date" bind:value={shared.extraction_date} class={inputCls} /></div>
				<div><label class="block text-xs font-medium text-slate-400 mb-1"><a href="/settings?tab=extraction_method" target="_blank" class="hover:text-ocean-400">Method</a></label>
					<select bind:value={shared.extraction_method} class={selectCls}>
						<option value="">Select...</option>
						{#each data.picklists.extraction_method as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select></div>
				<div><label class="block text-xs font-medium text-slate-400 mb-1"><a href="/settings?tab=extraction_kit" target="_blank" class="hover:text-ocean-400">Kit</a></label>
					<select bind:value={shared.extraction_kit} class={selectCls}>
						<option value="">Select...</option>
						{#each data.picklists.extraction_kit as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select></div>
				<div><label class="block text-xs font-medium text-slate-400 mb-1">Quantification</label>
					<select bind:value={shared.quantification_method} class={selectCls}>
						<option value="">Select...</option><option>Qubit</option><option>NanoDrop</option><option>Bioanalyzer</option><option>Other</option>
					</select></div>
				<div><label class="block text-xs font-medium text-slate-400 mb-1"><a href="/settings?tab=storage_room" target="_blank" class="hover:text-ocean-400">Room/Freezer</a></label>
					<select bind:value={shared.storage_room} class={selectCls}>
						<option value="">Select...</option>
						{#each data.picklists.storage_room as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select></div>
				<div><label class="block text-xs font-medium text-slate-400 mb-1"><a href="/settings?tab=storage_box" target="_blank" class="hover:text-ocean-400">Storage Box</a></label>
					<select bind:value={shared.storage_box} class={selectCls}>
						<option value="">Select...</option>
						{#each data.picklists.storage_box as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select></div>
				<div><label class="block text-xs font-medium text-slate-400 mb-1">Notes</label>
					<input type="text" bind:value={shared.notes} class={inputCls} /></div>
			</div>
			<PeoplePicker
				bind:people
				personnel={data.personnel}
				roleOptions={data.picklists.person_role}
				defaultRole="extractor"
				label="People (applied to all)"
			/>
		</div>
	</div>

	<!-- Per-item table -->
	{#if rows.length > 0}
	<div class="overflow-x-auto">
		<table class="w-full text-sm">
			<thead>
				<tr class="text-xs text-slate-400 uppercase tracking-wider border-b border-slate-700">
					<th class="text-left pb-2 pr-3 font-medium">Sample</th>
					<th class="text-left pb-2 pr-3 font-medium min-w-36">Extract Name *</th>
					<th class="text-left pb-2 pr-3 font-medium w-24">Conc. ng/µL</th>
					<th class="text-left pb-2 pr-3 font-medium w-24">Vol. µL</th>
					<th class="text-left pb-2 pr-3 font-medium w-20">260/280</th>
					<th class="text-left pb-2 pr-3 font-medium w-20">260/230</th>
					<th class="pb-2 w-8"></th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-800">
				{#each rows as row, i}
				<tr>
					<td class="py-2 pr-3">
						<div class="text-white">{row.samp_name}</div>
						<div class="text-xs text-slate-500">{row.project_name}</div>
					</td>
					<td class="py-2 pr-3"><input type="text" bind:value={rows[i].extract_name} class={cellInput} /></td>
					<td class="py-2 pr-3"><input type="number" step="any" bind:value={rows[i].concentration_ng_ul} class={cellInput} placeholder="—" /></td>
					<td class="py-2 pr-3"><input type="number" step="any" bind:value={rows[i].total_volume_ul} class={cellInput} placeholder="—" /></td>
					<td class="py-2 pr-3"><input type="number" step="any" bind:value={rows[i].a260_280} class={cellInput} placeholder="—" /></td>
					<td class="py-2 pr-3"><input type="number" step="any" bind:value={rows[i].a260_230} class={cellInput} placeholder="—" /></td>
					<td class="py-2">
						<button onclick={() => toggleSample(row.sample_id, row.samp_name, row.project_name)} class="text-slate-600 hover:text-red-400 transition-colors">✕</button>
					</td>
				</tr>
				{/each}
			</tbody>
		</table>
	</div>
	{/if}

	<div class="flex gap-3 pt-2">
		<button onclick={submitBatch} disabled={saving || rows.length === 0} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">
			{saving ? 'Creating...' : `Create ${rows.length} Extract${rows.length !== 1 ? 's' : ''}`}
		</button>
		<a href="/extracts" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</a>
	</div>
	{/if}
</div>
