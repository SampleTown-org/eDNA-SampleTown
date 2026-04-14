<script lang="ts">
	import { goto } from '$app/navigation';
	import PeoplePicker from '$lib/components/PeoplePicker.svelte';
	import FieldLabel from '$lib/components/FieldLabel.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Plate-edit branch state. Mirrors pcr/new: plate_name + pcr_date + notes
	// are direct fields; primer details (forward/reverse name+seq, target_gene,
	// target_subfragment) are sourced from a Primer Set picker; PCR conditions
	// (polymerase, annealing temp, cycles, conditions string) come from a PCR
	// Protocol picker. Both pickers start unselected and overwrite the
	// underlying fields when chosen — the existing values are surfaced as
	// read-only "current" lines so the operator knows what's already set.
	let plateForm = $state(
		data.type === 'plate'
			? {
					plate_name: (data.plate as any).plate_name || '',
					pcr_date: (data.plate as any).pcr_date || '',
					primer_set_id: (data.plate as any).primer_set_id || '',
					target_subfragment: (data.plate as any).target_subfragment || '',
					forward_primer_name: (data.plate as any).forward_primer_name || '',
					forward_primer_seq: (data.plate as any).forward_primer_seq || '',
					reverse_primer_name: (data.plate as any).reverse_primer_name || '',
					reverse_primer_seq: (data.plate as any).reverse_primer_seq || '',
					pcr_conditions: (data.plate as any).pcr_conditions || '',
					annealing_temp_c: (data.plate as any).annealing_temp_c ?? '',
					num_cycles: (data.plate as any).num_cycles ?? '',
					polymerase: (data.plate as any).polymerase || '',
					nucl_acid_amp: (data.plate as any).nucl_acid_amp || '',
					notes: (data.plate as any).notes || ''
				}
			: ({} as any)
	);
	let platePeople = $state<{ personnel_id: string; role?: string | null }[]>(
		data.type === 'plate' ? data.people ?? [] : []
	);

	// Resolved target_gene from the selected primer_set (never stored directly).
	const plateGene = $derived.by(() => {
		if (data.type !== 'plate') return '';
		const ps = (data.primerSets as any[] | undefined)?.find((p: any) => p.id === plateForm.primer_set_id);
		return ps?.target_gene ?? '';
	});

	function onPrimerSetChange() {
		if (data.type !== 'plate') return;
		const ps = (data.primerSets as any[] | undefined)?.find((p: any) => p.id === plateForm.primer_set_id);
		if (!ps) return;
		plateForm.target_subfragment = ps.target_subfragment || '';
		plateForm.forward_primer_name = ps.forward_primer_name || '';
		plateForm.forward_primer_seq = ps.forward_primer_seq || '';
		plateForm.reverse_primer_name = ps.reverse_primer_name || '';
		plateForm.reverse_primer_seq = ps.reverse_primer_seq || '';
	}

	let selectedProtocolId = $state('');
	function onProtocolChange() {
		if (data.type !== 'plate') return;
		const proto = (data.pcrProtocols as any[] | undefined)?.find((p: any) => p.id === selectedProtocolId);
		if (!proto) return;
		plateForm.polymerase = proto.polymerase || '';
		plateForm.annealing_temp_c = proto.annealing_temp_c ?? '';
		plateForm.num_cycles = proto.num_cycles ?? '';
		plateForm.pcr_conditions = proto.pcr_conditions || '';
	}

	// Reaction-edit branch state
	let reactionForm = $state(
		data.type === 'reaction'
			? {
					pcr_name: (data.pcr as any).pcr_name || '',
					primer_set_id: (data.pcr as any).primer_set_id || '',
					target_subfragment: (data.pcr as any).target_subfragment || '',
					forward_primer_name: (data.pcr as any).forward_primer_name || '',
					forward_primer_seq: (data.pcr as any).forward_primer_seq || '',
					reverse_primer_name: (data.pcr as any).reverse_primer_name || '',
					reverse_primer_seq: (data.pcr as any).reverse_primer_seq || '',
					annealing_temp_c: (data.pcr as any).annealing_temp_c ?? '',
					num_cycles: (data.pcr as any).num_cycles ?? '',
					polymerase: (data.pcr as any).polymerase || '',
					pcr_date: (data.pcr as any).pcr_date || '',
					band_observed: (data.pcr as any).band_observed || '',
					concentration_ng_ul: (data.pcr as any).concentration_ng_ul ?? '',
					notes: (data.pcr as any).notes || ''
				}
			: ({} as any)
	);

	let saving = $state(false);
	let errorMsg = $state('');

	async function submitPlate() {
		if (!plateForm.plate_name.trim()) { errorMsg = 'Plate name is required'; return; }
		saving = true; errorMsg = '';

		const body = {
			...plateForm,
			people: platePeople,
			annealing_temp_c: plateForm.annealing_temp_c === '' ? null : Number(plateForm.annealing_temp_c),
			num_cycles: plateForm.num_cycles === '' ? null : Number(plateForm.num_cycles)
		};
		const res = await fetch(`/api/pcr-plates/${(data.plate as any).id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (res.ok) {
			goto(`/pcr/${(data.plate as any).id}`);
		} else {
			const err = await res.json().catch(() => null);
			if (err?.issues?.length) {
				errorMsg = err.issues.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join('; ');
			} else {
				errorMsg = err?.error || 'Failed to update plate';
			}
			saving = false;
		}
	}

	async function submitReaction() {
		saving = true; errorMsg = '';

		const body = {
			...reactionForm,
			annealing_temp_c: reactionForm.annealing_temp_c === '' ? null : Number(reactionForm.annealing_temp_c),
			num_cycles: reactionForm.num_cycles === '' ? null : Number(reactionForm.num_cycles),
			concentration_ng_ul: reactionForm.concentration_ng_ul === '' ? null : Number(reactionForm.concentration_ng_ul)
		};
		const res = await fetch(`/api/pcr/${(data.pcr as any).id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (res.ok) {
			goto(`/pcr/${(data.pcr as any).id}`);
		} else {
			errorMsg = (await res.json().catch(() => ({}))).error || 'Failed to update PCR';
			saving = false;
		}
	}

	const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';
	const selectCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500';
</script>

<div class="max-w-3xl space-y-6">
	<div>
		<a href="/pcr" class="text-sm text-slate-400 hover:text-ocean-400">&larr; PCR</a>
		{#if data.type === 'plate'}
			<h1 class="text-2xl font-bold text-white mt-1">Edit Plate {(data.plate as any).plate_name}</h1>
		{:else}
			<h1 class="text-2xl font-bold text-white mt-1">Edit {(data.pcr as any).pcr_name}</h1>
		{/if}
	</div>

	{#if errorMsg}
		<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>
	{/if}

	{#if data.type === 'plate'}
		<form onsubmit={(e) => { e.preventDefault(); submitPlate(); }} class="space-y-4">
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label for="plate_name" class="block text-sm font-medium text-slate-300 mb-1">Plate Name</label>
					<input id="plate_name" type="text" bind:value={plateForm.plate_name} class={inputCls} />
				</div>
				<div>
					<label for="pcr_date" class="block text-sm font-medium text-slate-300 mb-1">PCR Date</label>
					<input id="pcr_date" type="date" bind:value={plateForm.pcr_date} class={inputCls} />
				</div>
			</div>

			<PeoplePicker
				bind:people={platePeople}
				personnel={data.personnel}
				roleOptions={data.picklists.person_role}
				defaultRole="pcr operator"
				label="People"
			/>

			<!-- Primer Set picker (mirrors pcr/new) -->
			<div>
				<label class="block text-sm font-medium text-slate-300 mb-1">
					<a href="/settings?tab=primers" target="_blank" class="hover:text-ocean-400">Primer Set</a>
					{#if plateGene}<span class="text-xs text-slate-500 font-normal">— {plateGene}{plateForm.target_subfragment ? ` ${plateForm.target_subfragment}` : ''}</span>{/if}
				</label>
				<select bind:value={plateForm.primer_set_id} onchange={onPrimerSetChange} class={selectCls}>
					<option value="">Select primer set...</option>
					{#each data.primerSets ?? [] as ps}
						<option value={ps.id}>{ps.name}</option>
					{/each}
				</select>
				<div class="mt-2 p-2 bg-slate-800/50 rounded text-xs text-slate-400 space-y-1">
					{#if plateForm.forward_primer_name || plateForm.forward_primer_seq}
						<div class="font-mono">F: {plateForm.forward_primer_name} — {plateForm.forward_primer_seq}</div>
					{/if}
					{#if plateForm.reverse_primer_name || plateForm.reverse_primer_seq}
						<div class="font-mono">R: {plateForm.reverse_primer_name} — {plateForm.reverse_primer_seq}</div>
					{/if}
					{#if !plateForm.forward_primer_name && !plateForm.reverse_primer_name}
						<div class="italic text-slate-500">No primers set — pick a primer set above to populate.</div>
					{/if}
				</div>
			</div>

			<!-- PCR Protocol picker (mirrors pcr/new) -->
			<div>
				<label class="block text-sm font-medium text-slate-300 mb-1">
					<a href="/settings?tab=protocols" target="_blank" class="hover:text-ocean-400">PCR Protocol</a>
				</label>
				<select bind:value={selectedProtocolId} onchange={onProtocolChange} class={selectCls}>
					<option value="">Keep current ({plateForm.polymerase || '—'} · {plateForm.annealing_temp_c || '—'}°C · {plateForm.num_cycles || '—'} cycles)</option>
					{#each data.pcrProtocols ?? [] as proto}
						<option value={proto.id}>{proto.name}</option>
					{/each}
				</select>
				{#if plateForm.pcr_conditions}
					<div class="mt-2 p-2 bg-slate-800/50 rounded text-xs text-slate-400 font-mono">{plateForm.pcr_conditions}</div>
				{/if}
			</div>

			<div>
				<FieldLabel slot="nucl_acid_amp" for="nucl_acid_amp" label="Amplification Protocol (MIxS)" />
				<input id="nucl_acid_amp" type="text" bind:value={plateForm.nucl_acid_amp} class={inputCls}
					placeholder="DOI or protocol URL" />
			</div>

			<div>
				<label class="block text-sm font-medium text-slate-300 mb-1">Notes</label>
				<textarea bind:value={plateForm.notes} rows="2" class={inputCls}></textarea>
			</div>

			<p class="text-xs text-slate-500">
				Editing plate-level fields only. Click any reaction in the table on the
				plate detail page to open and edit it individually.
			</p>

			<div class="flex gap-3 pt-2">
				<button type="submit" disabled={saving} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">
					{saving ? 'Saving...' : 'Save'}
				</button>
				<a href="/pcr/{(data.plate as any).id}" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</a>
			</div>
		</form>

	{:else}
		<!-- Legacy individual-reaction edit form (untouched) -->
		<form onsubmit={(e) => { e.preventDefault(); submitReaction(); }} class="space-y-6">
			<div>
				<label for="pcr_name" class="block text-sm font-medium text-slate-300 mb-1">PCR Name</label>
				<input id="pcr_name" type="text" bind:value={reactionForm.pcr_name} class={inputCls} />
			</div>
			<div>
				<label class="block text-sm font-medium text-slate-300 mb-1">Target Subfragment</label>
				<input type="text" bind:value={reactionForm.target_subfragment} class={inputCls} />
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label class="block text-sm font-medium text-slate-300 mb-1">Forward Primer Name</label>
					<input type="text" bind:value={reactionForm.forward_primer_name} class={inputCls} />
				</div>
				<div>
					<label class="block text-sm font-medium text-slate-300 mb-1">Forward Primer Sequence</label>
					<input type="text" bind:value={reactionForm.forward_primer_seq} class="{inputCls} font-mono" />
				</div>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label class="block text-sm font-medium text-slate-300 mb-1">Reverse Primer Name</label>
					<input type="text" bind:value={reactionForm.reverse_primer_name} class={inputCls} />
				</div>
				<div>
					<label class="block text-sm font-medium text-slate-300 mb-1">Reverse Primer Sequence</label>
					<input type="text" bind:value={reactionForm.reverse_primer_seq} class="{inputCls} font-mono" />
				</div>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
				<div>
					<label class="block text-sm font-medium text-slate-300 mb-1">Annealing Temp (°C)</label>
					<input type="number" step="any" bind:value={reactionForm.annealing_temp_c} class={inputCls} />
				</div>
				<div>
					<label class="block text-sm font-medium text-slate-300 mb-1">Number of Cycles</label>
					<input type="number" bind:value={reactionForm.num_cycles} class={inputCls} />
				</div>
				<div>
					<label class="block text-sm font-medium text-slate-300 mb-1">Polymerase</label>
					<input type="text" bind:value={reactionForm.polymerase} class={inputCls} />
				</div>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
				<div>
					<label class="block text-sm font-medium text-slate-300 mb-1">PCR Date</label>
					<input type="date" bind:value={reactionForm.pcr_date} class={inputCls} />
				</div>
				<div>
					<label class="block text-sm font-medium text-slate-300 mb-1">Band Observed</label>
					<select bind:value={reactionForm.band_observed} class={selectCls}>
						<option value="">Select...</option>
						<option value="Yes">Yes</option>
						<option value="No">No</option>
					</select>
				</div>
				<div>
					<label class="block text-sm font-medium text-slate-300 mb-1">Concentration (ng/uL)</label>
					<input type="number" step="any" bind:value={reactionForm.concentration_ng_ul} class={inputCls} />
				</div>
			</div>
			<div>
				<label class="block text-sm font-medium text-slate-300 mb-1">Notes</label>
				<textarea bind:value={reactionForm.notes} rows="2" class={inputCls}></textarea>
			</div>

			<div class="flex gap-3 pt-2">
				<button type="submit" disabled={saving} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">
					{saving ? 'Saving...' : 'Save'}
				</button>
				<a href="/pcr/{(data.pcr as any).id}" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</a>
			</div>
		</form>
	{/if}
</div>
