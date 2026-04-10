<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let form = $state({
		pcr_name: data.pcr.pcr_name || '',
		target_gene: data.pcr.target_gene || '',
		target_subfragment: data.pcr.target_subfragment || '',
		forward_primer_name: data.pcr.forward_primer_name || '',
		forward_primer_seq: data.pcr.forward_primer_seq || '',
		reverse_primer_name: data.pcr.reverse_primer_name || '',
		reverse_primer_seq: data.pcr.reverse_primer_seq || '',
		annealing_temp_c: data.pcr.annealing_temp_c ?? '',
		num_cycles: data.pcr.num_cycles ?? '',
		polymerase: data.pcr.polymerase || '',
		pcr_date: data.pcr.pcr_date || '',
		band_observed: data.pcr.band_observed || '',
		concentration_ng_ul: data.pcr.concentration_ng_ul ?? '',
		notes: data.pcr.notes || ''
	});

	let saving = $state(false);
	let errorMsg = $state('');

	async function submit() {
		saving = true;
		errorMsg = '';

		const body = {
			...form,
			annealing_temp_c: form.annealing_temp_c === '' ? null : Number(form.annealing_temp_c),
			num_cycles: form.num_cycles === '' ? null : Number(form.num_cycles),
			concentration_ng_ul: form.concentration_ng_ul === '' ? null : Number(form.concentration_ng_ul)
		};
		const res = await fetch(`/api/pcr/${data.pcr.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (res.ok) {
			goto(`/pcr/${data.pcr.id}`);
		} else {
			errorMsg = 'Failed to update PCR';
			saving = false;
		}
	}

	const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';
	const selectCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500';
</script>

<div class="max-w-3xl space-y-6">
	<div>
		<a href="/pcr" class="text-sm text-slate-400 hover:text-ocean-400">&larr; PCR</a>
		<h1 class="text-2xl font-bold text-white mt-1">Edit {data.pcr.pcr_name}</h1>
	</div>

	{#if errorMsg}
		<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>
	{/if}

	<form onsubmit={(e) => { e.preventDefault(); submit(); }} class="space-y-6">
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label for="pcr_name" class="block text-sm font-medium text-slate-300 mb-1">PCR Name</label>
				<input id="pcr_name" type="text" bind:value={form.pcr_name} class={inputCls} />
			</div>
			<div>
				<label for="target_gene" class="block text-sm font-medium text-slate-300 mb-1">Target Gene</label>
				<select id="target_gene" bind:value={form.target_gene} class={selectCls}>
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
			<label for="target_subfragment" class="block text-sm font-medium text-slate-300 mb-1">Target Subfragment</label>
			<input id="target_subfragment" type="text" bind:value={form.target_subfragment} class={inputCls} />
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label for="forward_primer_name" class="block text-sm font-medium text-slate-300 mb-1">Forward Primer Name</label>
				<input id="forward_primer_name" type="text" bind:value={form.forward_primer_name} class={inputCls} />
			</div>
			<div>
				<label for="forward_primer_seq" class="block text-sm font-medium text-slate-300 mb-1">Forward Primer Sequence</label>
				<input id="forward_primer_seq" type="text" bind:value={form.forward_primer_seq} class="{inputCls} font-mono" />
			</div>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label for="reverse_primer_name" class="block text-sm font-medium text-slate-300 mb-1">Reverse Primer Name</label>
				<input id="reverse_primer_name" type="text" bind:value={form.reverse_primer_name} class={inputCls} />
			</div>
			<div>
				<label for="reverse_primer_seq" class="block text-sm font-medium text-slate-300 mb-1">Reverse Primer Sequence</label>
				<input id="reverse_primer_seq" type="text" bind:value={form.reverse_primer_seq} class="{inputCls} font-mono" />
			</div>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
			<div>
				<label for="annealing_temp_c" class="block text-sm font-medium text-slate-300 mb-1">Annealing Temp (C)</label>
				<input id="annealing_temp_c" type="number" step="any" bind:value={form.annealing_temp_c} class={inputCls} />
			</div>
			<div>
				<label for="num_cycles" class="block text-sm font-medium text-slate-300 mb-1">Number of Cycles</label>
				<input id="num_cycles" type="number" bind:value={form.num_cycles} class={inputCls} />
			</div>
			<div>
				<label for="polymerase" class="block text-sm font-medium text-slate-300 mb-1">Polymerase</label>
				<input id="polymerase" type="text" bind:value={form.polymerase} class={inputCls} />
			</div>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
			<div>
				<label for="pcr_date" class="block text-sm font-medium text-slate-300 mb-1">PCR Date</label>
				<input id="pcr_date" type="date" bind:value={form.pcr_date} class={inputCls} />
			</div>
			<div>
				<label for="band_observed" class="block text-sm font-medium text-slate-300 mb-1">Band Observed</label>
				<select id="band_observed" bind:value={form.band_observed} class={selectCls}>
					<option value="">Select...</option>
					<option value="Yes">Yes</option>
					<option value="No">No</option>
				</select>
			</div>
			<div>
				<label for="concentration_ng_ul" class="block text-sm font-medium text-slate-300 mb-1">Concentration (ng/uL)</label>
				<input id="concentration_ng_ul" type="number" step="any" bind:value={form.concentration_ng_ul} class={inputCls} />
			</div>
		</div>
		<div>
			<label for="notes" class="block text-sm font-medium text-slate-300 mb-1">Notes</label>
			<textarea id="notes" bind:value={form.notes} rows="2" class={inputCls}></textarea>
		</div>

		<div class="flex gap-3 pt-2">
			<button type="submit" disabled={saving} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">
				{saving ? 'Saving...' : 'Save'}
			</button>
			<a href="/pcr/{data.pcr.id}" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</a>
		</div>
	</form>
</div>
