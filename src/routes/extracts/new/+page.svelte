<script lang="ts">
	import { goto } from '$app/navigation';
	import PeoplePicker from '$lib/components/PeoplePicker.svelte';
	import FieldLabel from '$lib/components/FieldLabel.svelte';
	import { cart } from '$lib/stores/cart.svelte';
	import { nameFromTemplate } from '$lib/naming';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	let people = $state<{ personnel_id: string; role?: string | null }[]>([]);

	// If the cart has samples, auto-switch to batch mode and pre-populate.
	// cartSamples is captured once at mount for pre-population; hasCartSamples
	// is reactive so the banner disappears when the user clears the cart.
	const cartSamples = cart.getByType('sample');
	const initialCartCount = cartSamples.length;
	let hasCartSamples = $derived(cart.getByType('sample').length > 0);

	let mode = $state<'single' | 'batch'>(
		initialCartCount > 0 ? 'batch' : (data.preselectedSampleId ? 'single' : 'single')
	);

	// Single mode
	let form = $state({
		sample_id: data.preselectedSampleId ?? '',
		extract_name: '', extraction_date: '', extraction_method: '',
		nucl_acid_type: 'DNA', nucl_acid_ext: '',
		samp_taxon_id: '', samp_vol_we_dna_ext: '', pool_dna_extracts: '',
		concentration_ng_ul: '', total_volume_ul: '', a260_280: '', a260_230: '',
		quantification_method: '', storage_room: '', storage_box: '', notes: ''
	});

	// Batch mode
	let selectedSampleIds = $state<Set<string>>(new Set());
	// Shared across every extract created in batch mode. Mirrors the single-mode
	// `form` shape so the two flows surface the same field set; per-row QC
	// values (concentration, volume, A260 ratios) stay in `rows[i]` because
	// those vary per extract.
	let shared = $state({
		extraction_date: '', extraction_method: '',
		nucl_acid_type: 'DNA', nucl_acid_ext: '',
		samp_taxon_id: '', samp_vol_we_dna_ext: '', pool_dna_extracts: '',
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
				extract_name: nameFromTemplate(data.namingTemplates, 'extract_name', { Sample: s.samp_name }, `${s.samp_name}_EXT`),
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
				extract_name: nameFromTemplate(data.namingTemplates, 'extract_name', { Sample: samp_name }, `${samp_name}_EXT`),
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

	// Filter sample list by cart when populated (reactive so clearing cart shows all)
	let filteredSamples = $derived.by(() => {
		const cartIds = cart.idsOfType('sample');
		if (cartIds.size === 0) return data.samples as any[];
		return (data.samples as any[]).filter((s: any) => cartIds.has(s.id));
	});

	const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';
	const selectCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500';
	const cellInput = 'w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500';
</script>

<div class="max-w-5xl space-y-6">
	<div>
		<a href="/extracts" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Extracts</a>
		<h1 class="text-2xl font-bold text-white mt-1">New Nucleic Acid Extract</h1>
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

	<!-- Shared across both modes so the batch shared-fields section can also
	     attach `list="samp_taxon_id_options"` to its input. -->
	<datalist id="samp_taxon_id_options">
		{#each data.picklists.samp_taxon_id as opt}
			<option value={opt.value} label={opt.label}></option>
		{/each}
	</datalist>

	{#if mode === 'single'}
	<form onsubmit={(e) => { e.preventDefault(); submitSingle(); }} class="space-y-4">
		<div>
			<FieldLabel slot="sample" for="sample_id" label="Source Sample" required description="Physical sample this extract was made from." />
			<select id="sample_id" bind:value={form.sample_id} class={selectCls}>
				<option value="">Select sample{hasCartSamples ? ` (${filteredSamples.length} from cart)` : ''}...</option>
				{#each filteredSamples as s}<option value={s.id}>{s.samp_name} ({s.project_name})</option>{/each}
			</select>
		</div>
		<div class="grid grid-cols-3 gap-4">
			<div>
				<FieldLabel slot="extract_name" for="extract_name" label="Extract Name" required description="Human-readable name for this nucleic acid extract. Unique within the lab." />
				<input id="extract_name" type="text" bind:value={form.extract_name} class={inputCls} placeholder={data.namingTemplates?.extract_name || 'e.g., EXT-001'} />
			</div>
			<div>
				<FieldLabel slot="extraction_date" for="extraction_date" label="Extraction Date" description="Date the extraction was performed." />
				<input id="extraction_date" type="date" bind:value={form.extraction_date} class={inputCls} />
			</div>
			<div>
				<FieldLabel slot="nucl_acid_type" for="nucl_acid_type" label="Nucleic Acid Type" picklistCategory="nucl_acid_type" description="DNA, RNA, total nucleic acid, or cDNA — what came out of the extraction." />
				<select id="nucl_acid_type" bind:value={form.nucl_acid_type} class={selectCls}>
					{#each data.picklists.nucl_acid_type as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
			</div>
		</div>
		<PeoplePicker
			bind:people
			personnel={data.personnel}
			roleOptions={data.picklists.person_role}
			defaultRole="extractor"
			label="People"
		/>
		<div>
			<FieldLabel slot="extraction_method" for="extraction_method" label="Extraction Method / Kit" picklistCategory="extraction_method" description="Kit or protocol used to extract nucleic acids." />
			<select id="extraction_method" bind:value={form.extraction_method} class={selectCls}>
				<option value="">Select...</option>
				{#each data.picklists.extraction_method as opt}<option value={opt.value}>{opt.label}</option>{/each}
			</select>
		</div>
		<div>
			<FieldLabel slot="nucl_acid_ext" for="nucl_acid_ext" />
			<input id="nucl_acid_ext" type="text" bind:value={form.nucl_acid_ext} class={inputCls}
				placeholder="DOI or protocol URL (MIxS nucl_acid_ext)" />
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
			<div>
				<FieldLabel slot="samp_taxon_id" for="samp_taxon_id" picklistCategory="samp_taxon_id" />
				<input id="samp_taxon_id" type="text" bind:value={form.samp_taxon_id} class={inputCls}
					list="samp_taxon_id_options"
					placeholder="NCBI taxid, e.g. 408172" />
			</div>
			<div>
				<FieldLabel slot="samp_vol_we_dna_ext" for="samp_vol_we_dna_ext" />
				<input id="samp_vol_we_dna_ext" type="text" bind:value={form.samp_vol_we_dna_ext} class={inputCls}
					placeholder="e.g. 1500 ml" />
			</div>
			<div>
				<FieldLabel slot="pool_dna_extracts" for="pool_dna_extracts" />
				<input id="pool_dna_extracts" type="text" bind:value={form.pool_dna_extracts} class={inputCls}
					placeholder="extract IDs if pooled" />
			</div>
		</div>
		<div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
			<div>
				<FieldLabel slot="concentration_ng_ul" for="concentration_ng_ul" label="Conc. (ng/µL)" description="Nucleic-acid concentration from quantification." />
				<input id="concentration_ng_ul" type="number" step="any" bind:value={form.concentration_ng_ul} class={inputCls} />
			</div>
			<div>
				<FieldLabel slot="total_volume_ul" for="total_volume_ul" label="Volume (µL)" description="Total elution volume for this extract." />
				<input id="total_volume_ul" type="number" step="any" bind:value={form.total_volume_ul} class={inputCls} />
			</div>
			<div>
				<FieldLabel slot="a260_280" for="a260_280" label="260/280" description="A260/A280 purity ratio (NanoDrop). DNA is clean ≈ 1.8." />
				<input id="a260_280" type="number" step="any" bind:value={form.a260_280} class={inputCls} />
			</div>
			<div>
				<FieldLabel slot="a260_230" for="a260_230" label="260/230" description="A260/A230 purity ratio (NanoDrop). Clean ≈ 2.0–2.2." />
				<input id="a260_230" type="number" step="any" bind:value={form.a260_230} class={inputCls} />
			</div>
		</div>
		<div class="grid grid-cols-3 gap-4">
			<div>
				<FieldLabel slot="quantification_method" for="quantification_method" label="Quantification" description="Instrument used to measure DNA concentration." />
				<select id="quantification_method" bind:value={form.quantification_method} class={selectCls}>
					<option value="">Select...</option><option>Qubit</option><option>NanoDrop</option><option>Bioanalyzer</option><option>Other</option>
				</select>
			</div>
			<div>
				<FieldLabel slot="storage_room" label="Room/Freezer" picklistCategory="storage_room" description="Physical room or freezer where this extract is stored." />
				<select bind:value={form.storage_room} class={selectCls}>
					<option value="">Select...</option>
					{#each data.picklists.storage_room as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
			</div>
			<div>
				<FieldLabel slot="storage_box" label="Storage Box" picklistCategory="storage_box" description="Labeled box or rack within the freezer." />
				<select bind:value={form.storage_box} class={selectCls}>
					<option value="">Select...</option>
					{#each data.picklists.storage_box as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
			</div>
		</div>
		<div>
			<FieldLabel slot="notes" for="notes" label="Notes" description="Free-form notes about this extract." />
			<textarea id="notes" bind:value={form.notes} rows="2" class={inputCls}></textarea>
		</div>
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
				{#each filteredSamples as s}
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
				<div>
					<FieldLabel slot="extraction_date" label="Extraction Date" description="Date the extraction was performed." />
					<input type="date" bind:value={shared.extraction_date} class={inputCls} />
				</div>
				<div>
					<FieldLabel slot="nucl_acid_type" label="Nucleic Acid Type" picklistCategory="nucl_acid_type" description="DNA, RNA, total nucleic acid, or cDNA." />
					<select bind:value={shared.nucl_acid_type} class={selectCls}>
						{#each data.picklists.nucl_acid_type as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select>
				</div>
				<div>
					<FieldLabel slot="extraction_method" label="Extraction Method / Kit" picklistCategory="extraction_method" description="Kit or protocol used to extract nucleic acids." />
					<select bind:value={shared.extraction_method} class={selectCls}>
						<option value="">Select...</option>
						{#each data.picklists.extraction_method as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select>
				</div>
				<div>
					<FieldLabel slot="nucl_acid_ext" label="Extraction Protocol (MIxS)" />
					<input type="text" bind:value={shared.nucl_acid_ext} class={inputCls}
						placeholder="DOI or protocol URL" />
				</div>
				<div>
					<FieldLabel slot="samp_taxon_id" picklistCategory="samp_taxon_id" />
					<input type="text" bind:value={shared.samp_taxon_id} class={inputCls}
						list="samp_taxon_id_options"
						placeholder="NCBI taxid, e.g. 408172" />
				</div>
				<div>
					<FieldLabel slot="samp_vol_we_dna_ext" />
					<input type="text" bind:value={shared.samp_vol_we_dna_ext} class={inputCls}
						placeholder="e.g. 1500 ml" />
				</div>
				<div>
					<FieldLabel slot="pool_dna_extracts" />
					<input type="text" bind:value={shared.pool_dna_extracts} class={inputCls}
						placeholder="extract IDs if pooled" />
				</div>
				<div>
					<FieldLabel slot="quantification_method" label="Quantification" description="Instrument used to measure DNA concentration." />
					<select bind:value={shared.quantification_method} class={selectCls}>
						<option value="">Select...</option><option>Qubit</option><option>NanoDrop</option><option>Bioanalyzer</option><option>Other</option>
					</select>
				</div>
				<div>
					<FieldLabel slot="storage_room" label="Room/Freezer" picklistCategory="storage_room" description="Physical room or freezer where these extracts are stored." />
					<select bind:value={shared.storage_room} class={selectCls}>
						<option value="">Select...</option>
						{#each data.picklists.storage_room as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select>
				</div>
				<div>
					<FieldLabel slot="storage_box" label="Storage Box" picklistCategory="storage_box" description="Labeled box or rack within the freezer." />
					<select bind:value={shared.storage_box} class={selectCls}>
						<option value="">Select...</option>
						{#each data.picklists.storage_box as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select>
				</div>
				<div>
					<FieldLabel slot="notes" label="Notes" description="Free-form notes applied to every extract in this batch." />
					<input type="text" bind:value={shared.notes} class={inputCls} />
				</div>
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
