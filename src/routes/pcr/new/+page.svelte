<script lang="ts">
	import { goto } from '$app/navigation';
	import PlateView from '$lib/components/PlateView.svelte';
	import PeoplePicker from '$lib/components/PeoplePicker.svelte';
	import { cart } from '$lib/stores/cart.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	let people = $state<{ personnel_id: string; role?: string | null }[]>([]);
	const cartExtracts = cart.getByType('extract');

	// Filter extract picker by cart: show extracts that are carted directly,
	// OR extracts from carted samples. Falls back to all if cart is empty.
	let displayExtracts = $derived.by(() => {
		const cartExtractIds = cart.idsOfType('extract');
		const cartSampleIds = cart.idsOfType('sample');
		if (cartExtractIds.size === 0 && cartSampleIds.size === 0) return data.extracts as any[];
		return (data.extracts as any[]).filter((e: any) =>
			cartExtractIds.has(e.id) || cartSampleIds.has(e.sample_id)
		);
	});
	let hasExtractFilter = $derived(
		cart.idsOfType('extract').size > 0 || cart.idsOfType('sample').size > 0
	);

	// Plate layout — assigns reactions to well positions (A1, A2, …).
	// Optional visual aid for laying out the plate on the bench; the mapping
	// doesn't currently persist (no well column in the schema yet).
	let showPlateView = $state(false);
	let plateFormat = $state<8 | 96 | 384>(96);
	let wellAssignments = $state<Record<string, string>>({});

	let plate = $state({
		plate_name: '', pcr_date: '', primer_set_id: '', target_subfragment: '',
		forward_primer_name: '', forward_primer_seq: '', reverse_primer_name: '', reverse_primer_seq: '',
		pcr_conditions: '', annealing_temp_c: '', num_cycles: '', polymerase: '', nucl_acid_amp: '', notes: ''
	});

	// Primer set selector — selecting a primer set sets primer_set_id + copies
	// the primer details into the plate (denormalized for custom overrides).
	function onPrimerSetChange() {
		const ps = (data.primerSets as any[]).find((p: any) => p.id === plate.primer_set_id);
		if (ps) {
			plate.target_subfragment = ps.target_subfragment || '';
			plate.forward_primer_name = ps.forward_primer_name || '';
			plate.forward_primer_seq = ps.forward_primer_seq || '';
			plate.reverse_primer_name = ps.reverse_primer_name || '';
			plate.reverse_primer_seq = ps.reverse_primer_seq || '';
			// Update row names using the gene from the selected primer set
			const gene = ps.target_gene;
			if (prevGene !== gene) {
				const old = prevGene;
				prevGene = gene;
				rows = rows.map(r => ({
					...r,
					pcr_name: r.pcr_name === `${r.extract_name}_${old}` || !r.pcr_name
						? `${r.extract_name}_${gene}` : r.pcr_name
				}));
			}
		}
	}

	// Protocol selector
	let selectedProtocolId = $state('');
	function onProtocolChange() {
		const proto = (data.pcrProtocols as any[]).find((p: any) => p.id === selectedProtocolId);
		if (proto) {
			plate.polymerase = proto.polymerase || '';
			plate.annealing_temp_c = proto.annealing_temp_c ?? '';
			plate.num_cycles = proto.num_cycles ?? '';
			plate.pcr_conditions = proto.pcr_conditions || '';
		}
	}

	let selectedExtractIds = $state<Set<string>>(new Set());
	type RowItem = { extract_id: string; extract_name: string; samp_name: string; pcr_name: string; concentration_ng_ul: string };
	let rows = $state<RowItem[]>([]);

	const plateItems = $derived(
		rows.map((r) => ({
			id: r.extract_id,
			label: r.pcr_name || r.extract_name,
			sublabel: r.samp_name
		}))
	);

	function toggleExtract(id: string, extract_name: string, samp_name: string) {
		if (selectedExtractIds.has(id)) {
			selectedExtractIds.delete(id);
			rows = rows.filter(r => r.extract_id !== id);
		} else {
			selectedExtractIds.add(id);
			rows = [...rows, {
				extract_id: id, extract_name, samp_name,
				pcr_name: `${extract_name}_${currentGene || 'PCR'}`,
				concentration_ng_ul: ''
			}];
		}
		selectedExtractIds = new Set(selectedExtractIds);
	}

	// Resolve the current target_gene from the selected primer_set (for display
	// and for auto-naming reactions). Never stored on the PCR — primer_sets
	// is the source of truth.
	const currentGene = $derived.by(() => {
		const ps = (data.primerSets as any[]).find((p: any) => p.id === plate.primer_set_id);
		return ps?.target_gene ?? '';
	});
	let prevGene = $state('');

	function selectAll() { data.extracts.forEach(e => { if (!selectedExtractIds.has(e.id)) toggleExtract(e.id, e.extract_name, e.samp_name); }); }
	function clearAll() { selectedExtractIds = new Set(); rows = []; }

	// Pre-populate from cart
	if (cartExtracts.length > 0) {
		const extractMap = new Map((data.extracts as any[]).map((e: any) => [e.id, e]));
		for (const ci of cartExtracts) {
			const e = extractMap.get(ci.id);
			if (!e) continue;
			if (selectedExtractIds.has(e.id)) continue;
			selectedExtractIds.add(e.id);
			rows.push({
				extract_id: e.id, extract_name: e.extract_name, samp_name: e.samp_name,
				pcr_name: `${e.extract_name}_${currentGene || 'PCR'}`,
				concentration_ng_ul: ''
			});
		}
		selectedExtractIds = new Set(selectedExtractIds);
	}

	let saving = $state(false);
	let errorMsg = $state('');

	async function submit() {
		if (!plate.plate_name.trim()) { errorMsg = 'Plate name is required'; return; }
		if (rows.length === 0) { errorMsg = 'Select at least one extract'; return; }
		saving = true; errorMsg = '';

		const body = {
			...plate,
			people,
			annealing_temp_c: plate.annealing_temp_c ? +plate.annealing_temp_c : null,
			num_cycles: plate.num_cycles ? +plate.num_cycles : null,
			reactions: rows.map(r => ({
				extract_id: r.extract_id, pcr_name: r.pcr_name,
				concentration_ng_ul: r.concentration_ng_ul ? +r.concentration_ng_ul : null,
			}))
		};
		const res = await fetch('/api/pcr-plates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (res.ok) { cart.clearType('extract'); const p = await res.json(); goto(`/pcr/${p.id}`); }
		else { const err = await res.json().catch(() => null); errorMsg = err?.error || `Failed (${res.status})`; saving = false; }
	}

	const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';
	const selectCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500';
	const cellInput = 'w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500';
</script>

<div class="max-w-5xl space-y-6">
	<div>
		<a href="/pcr" class="text-sm text-slate-400 hover:text-ocean-400">&larr; PCR</a>
		<h1 class="text-2xl font-bold text-white mt-1">New PCR Plate</h1>
	</div>

	{#if cartExtracts.length > 0}
		<div class="p-3 rounded-lg bg-ocean-900/20 border border-ocean-800 text-ocean-300 text-sm flex items-center justify-between">
			<span>Pre-filled {cartExtracts.length} extract{cartExtracts.length === 1 ? '' : 's'} from cart</span>
			<button onclick={() => { cart.clearType('extract'); rows = []; selectedExtractIds = new Set(); }} class="text-xs text-slate-400 hover:text-white">Clear</button>
		</div>
	{/if}
	{#if errorMsg}<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>{/if}

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
			{#if hasExtractFilter}
				<p class="text-[10px] text-ocean-400">
					<svg class="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M3 4h18l-7 8v5l-4 2V12L3 4z"/></svg>
					showing {displayExtracts.length}/{(data.extracts as any[]).length} from cart
				</p>
			{/if}
			<div class="space-y-1 max-h-80 overflow-y-auto pr-1">
				{#each displayExtracts as e}
				<label class="flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors {selectedExtractIds.has(e.id) ? 'bg-ocean-900/40 border border-ocean-700' : 'bg-slate-800/50 border border-transparent hover:bg-slate-800'}">
					<input type="checkbox" checked={selectedExtractIds.has(e.id)} onchange={() => toggleExtract(e.id, e.extract_name, e.samp_name)} class="mt-0.5 accent-ocean-500" />
					<div><div class="text-sm text-white">{e.extract_name}</div><div class="text-xs text-slate-500">{e.samp_name}</div></div>
				</label>
				{/each}
			</div>
			<p class="text-xs text-slate-500">{selectedExtractIds.size} selected</p>
		</div>

		<!-- Plate fields -->
		<div class="lg:col-span-2 space-y-4">
			<div class="grid grid-cols-2 gap-4">
				<div><label class="block text-xs font-medium text-slate-400 mb-1">Plate Name</label>
					<input type="text" bind:value={plate.plate_name} class={inputCls} placeholder={data.namingTemplates?.pcr_plate_name || 'e.g., 16S_Plate_001'} /></div>
				<div><label class="block text-xs font-medium text-slate-400 mb-1">Date</label>
					<input type="date" bind:value={plate.pcr_date} class={inputCls} /></div>
			</div>
			<PeoplePicker
				bind:people
				personnel={data.personnel}
				roleOptions={data.picklists.person_role}
				defaultRole="pcr operator"
				label="People"
			/>

			<!-- Primer Set selector -->
			<div>
				<label class="block text-xs font-medium text-slate-400 mb-1"><a href="/settings?tab=primers" target="_blank" class="hover:text-ocean-400">Primer Set</a></label>
				<select bind:value={plate.primer_set_id} onchange={onPrimerSetChange} class={selectCls}>
					<option value="">Select primer set...</option>
					{#each data.primerSets as ps}
						<option value={ps.id}>{ps.name}</option>
					{/each}
				</select>
				{#if plate.primer_set_id}
					{@const ps = (data.primerSets as any[]).find((p) => p.id === plate.primer_set_id)}
					{#if ps}
					<div class="mt-2 p-2 bg-slate-800/50 rounded text-xs text-slate-400 space-y-1">
						<div class="flex gap-4">
							<span>{ps.target_gene} {ps.target_subfragment || ''}</span>
							{#if ps.reference}<span class="text-slate-500">{ps.reference}</span>{/if}
						</div>
						<div class="font-mono">F: {ps.forward_primer_name} — {ps.forward_primer_seq}</div>
						<div class="font-mono">R: {ps.reverse_primer_name} — {ps.reverse_primer_seq}</div>
					</div>
					{/if}
				{/if}
			</div>

			<!-- Protocol selector -->
			<div>
				<label class="block text-xs font-medium text-slate-400 mb-1"><a href="/settings?tab=protocols" target="_blank" class="hover:text-ocean-400">PCR Protocol</a></label>
				<select bind:value={selectedProtocolId} onchange={onProtocolChange} class={selectCls}>
					<option value="">Select protocol...</option>
					{#each data.pcrProtocols as proto}
						<option value={proto.id}>{proto.name}</option>
					{/each}
				</select>
				{#if selectedProtocolId}
					{@const proto = (data.pcrProtocols as any[]).find((p) => p.id === selectedProtocolId)}
					{#if proto}
					<div class="mt-2 p-2 bg-slate-800/50 rounded text-xs text-slate-400">
						<span>{proto.polymerase} &middot; {proto.annealing_temp_c}°C &middot; {proto.num_cycles} cycles</span>
						{#if proto.pcr_conditions}<div class="font-mono mt-1">{proto.pcr_conditions}</div>{/if}
					</div>
					{/if}
				{/if}
			</div>

			<div><label class="block text-xs font-medium text-slate-400 mb-1">
					<a href="/glossary#nucl_acid_amp" target="_blank" class="hover:text-ocean-400">Amplification Protocol (MIxS)</a>
				</label>
				<input type="text" bind:value={plate.nucl_acid_amp} class={inputCls}
					placeholder="DOI or protocol URL" /></div>

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

	<!-- Per-reaction table -->
	{#if rows.length > 0}
	<div class="overflow-x-auto">
		<p class="text-sm font-semibold text-slate-300 mb-2">Reactions ({rows.length})</p>
		<table class="w-full text-sm">
			<thead>
				<tr class="text-xs text-slate-400 uppercase tracking-wider border-b border-slate-700">
					<th class="text-left pb-2 pr-3 font-medium">Extract</th>
					<th class="text-left pb-2 pr-3 font-medium min-w-36">Reaction Name</th>
					<th class="text-left pb-2 pr-3 font-medium w-28">Conc. ng/µL</th>
					<th class="pb-2 w-8"></th>
				</tr>
			</thead>
			<tbody class="divide-y divide-slate-800">
				{#each rows as row, i}
				<tr>
					<td class="py-2 pr-3"><div class="text-white">{row.extract_name}</div><div class="text-xs text-slate-500">{row.samp_name}</div></td>
					<td class="py-2 pr-3"><input type="text" bind:value={rows[i].pcr_name} class={cellInput} /></td>
					<td class="py-2 pr-3"><input type="number" step="any" bind:value={rows[i].concentration_ng_ul} class={cellInput} placeholder="--" /></td>
					<td class="py-2"><button onclick={() => toggleExtract(row.extract_id, row.extract_name, row.samp_name)} class="text-slate-600 hover:text-red-400 transition-colors">✕</button></td>
				</tr>
				{/each}
			</tbody>
		</table>
	</div>
	{/if}

	<div class="flex gap-3 pt-2">
		<button onclick={submit} disabled={saving || rows.length === 0} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">
			{saving ? 'Creating...' : `Create Plate (${rows.length} reaction${rows.length !== 1 ? 's' : ''})`}
		</button>
		<a href="/pcr" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</a>
	</div>
</div>
