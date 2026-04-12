<script lang="ts">
	import { goto } from '$app/navigation';
	import PeoplePicker from '$lib/components/PeoplePicker.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Plate-edit branch state
	let plateForm = $state(
		data.type === 'plate'
			? {
					plate_name: (data.plate as any).plate_name || '',
					pcr_date: (data.plate as any).pcr_date || '',
					target_gene: (data.plate as any).target_gene || '',
					target_subfragment: (data.plate as any).target_subfragment || '',
					forward_primer_name: (data.plate as any).forward_primer_name || '',
					forward_primer_seq: (data.plate as any).forward_primer_seq || '',
					reverse_primer_name: (data.plate as any).reverse_primer_name || '',
					reverse_primer_seq: (data.plate as any).reverse_primer_seq || '',
					pcr_conditions: (data.plate as any).pcr_conditions || '',
					annealing_temp_c: (data.plate as any).annealing_temp_c ?? '',
					num_cycles: (data.plate as any).num_cycles ?? '',
					polymerase: (data.plate as any).polymerase || '',
					notes: (data.plate as any).notes || ''
				}
			: ({} as any)
	);
	let platePeople = $state<{ personnel_id: string; role?: string | null }[]>(
		data.type === 'plate' ? data.people ?? [] : []
	);

	// Reaction-edit branch state (legacy form, unchanged from before plates landed)
	let reactionForm = $state(
		data.type === 'reaction'
			? {
					pcr_name: (data.pcr as any).pcr_name || '',
					target_gene: (data.pcr as any).target_gene || '',
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
		if (!plateForm.target_gene) { errorMsg = 'Target gene is required'; return; }
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

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label for="target_gene" class="block text-sm font-medium text-slate-300 mb-1">Target Gene</label>
					<select id="target_gene" bind:value={plateForm.target_gene} class={selectCls}>
						<option value="">Select...</option>
						<option value="16S">16S</option>
						<option value="18S">18S</option>
						<option value="CO1">CO1</option>
						<option value="12S">12S</option>
						<option value="ITS">ITS</option>
						<option value="other">other</option>
					</select>
				</div>
				<div>
					<label for="target_subfragment" class="block text-sm font-medium text-slate-300 mb-1">Target Subfragment</label>
					<input id="target_subfragment" type="text" bind:value={plateForm.target_subfragment} class={inputCls} />
				</div>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label class="block text-sm font-medium text-slate-300 mb-1">Forward Primer Name</label>
					<input type="text" bind:value={plateForm.forward_primer_name} class={inputCls} />
				</div>
				<div>
					<label class="block text-sm font-medium text-slate-300 mb-1">Forward Primer Sequence</label>
					<input type="text" bind:value={plateForm.forward_primer_seq} class="{inputCls} font-mono" />
				</div>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label class="block text-sm font-medium text-slate-300 mb-1">Reverse Primer Name</label>
					<input type="text" bind:value={plateForm.reverse_primer_name} class={inputCls} />
				</div>
				<div>
					<label class="block text-sm font-medium text-slate-300 mb-1">Reverse Primer Sequence</label>
					<input type="text" bind:value={plateForm.reverse_primer_seq} class="{inputCls} font-mono" />
				</div>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
				<div>
					<label class="block text-sm font-medium text-slate-300 mb-1">Annealing Temp (°C)</label>
					<input type="number" step="any" bind:value={plateForm.annealing_temp_c} class={inputCls} />
				</div>
				<div>
					<label class="block text-sm font-medium text-slate-300 mb-1">Cycles</label>
					<input type="number" bind:value={plateForm.num_cycles} class={inputCls} />
				</div>
				<div>
					<label class="block text-sm font-medium text-slate-300 mb-1">
						<a href="/settings?tab=category" target="_blank" class="hover:text-ocean-400">Polymerase</a>
					</label>
					<input type="text" bind:value={plateForm.polymerase} list="polymerase-list" class={inputCls} />
					<datalist id="polymerase-list">
						{#each data.picklists.polymerase ?? [] as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</datalist>
				</div>
			</div>

			<div>
				<label class="block text-sm font-medium text-slate-300 mb-1">PCR Conditions</label>
				<textarea bind:value={plateForm.pcr_conditions} rows="2" class="{inputCls} font-mono text-xs"></textarea>
			</div>

			<div>
				<label class="block text-sm font-medium text-slate-300 mb-1">Notes</label>
				<textarea bind:value={plateForm.notes} rows="2" class={inputCls}></textarea>
			</div>

			<p class="text-xs text-slate-500">
				Editing plate-level fields only. To edit an individual reaction, open it
				from the plate detail page.
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
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label for="pcr_name" class="block text-sm font-medium text-slate-300 mb-1">PCR Name</label>
					<input id="pcr_name" type="text" bind:value={reactionForm.pcr_name} class={inputCls} />
				</div>
				<div>
					<label for="target_gene_r" class="block text-sm font-medium text-slate-300 mb-1">Target Gene</label>
					<select id="target_gene_r" bind:value={reactionForm.target_gene} class={selectCls}>
						<option value="">Select...</option>
						<option value="16S">16S</option>
						<option value="18S">18S</option>
						<option value="CO1">CO1</option>
						<option value="12S">12S</option>
						<option value="ITS">ITS</option>
						<option value="other">other</option>
					</select>
				</div>
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
