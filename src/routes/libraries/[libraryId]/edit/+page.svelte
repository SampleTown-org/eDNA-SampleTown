<script lang="ts">
	import { goto } from '$app/navigation';
	import { SEQUENCING_PLATFORMS, INSTRUMENT_MODELS } from '$lib/mixs/controlled-vocab';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let form = $state({
		library_name: data.library.library_name || '',
		library_type: data.library.library_type || '',
		library_prep_kit: data.library.library_prep_kit || '',
		library_prep_date: data.library.library_prep_date || '',
		platform: data.library.platform || '',
		instrument_model: data.library.instrument_model || '',
		index_sequence_i7: data.library.index_sequence_i7 || '',
		index_sequence_i5: data.library.index_sequence_i5 || '',
		barcode: data.library.barcode || '',
		fragment_size_bp: data.library.fragment_size_bp ?? '',
		final_concentration_ng_ul: data.library.final_concentration_ng_ul ?? '',
		notes: data.library.notes || ''
	});

	let availableModels = $derived(
		form.platform ? (INSTRUMENT_MODELS[form.platform] || []) : []
	);

	let saving = $state(false);
	let errorMsg = $state('');

	async function submit() {
		saving = true;
		errorMsg = '';

		const body = {
			...form,
			fragment_size_bp: form.fragment_size_bp === '' ? null : Number(form.fragment_size_bp),
			final_concentration_ng_ul: form.final_concentration_ng_ul === '' ? null : Number(form.final_concentration_ng_ul)
		};
		const res = await fetch(`/api/libraries/${data.library.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (res.ok) {
			goto(`/libraries/${data.library.id}`);
		} else {
			errorMsg = 'Failed to update library';
			saving = false;
		}
	}

	const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';
	const selectCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500';
</script>

<div class="max-w-3xl space-y-6">
	<div>
		<a href="/libraries" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Libraries</a>
		<h1 class="text-2xl font-bold text-white mt-1">Edit {data.library.library_name}</h1>
	</div>

	{#if errorMsg}
		<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>
	{/if}

	<form onsubmit={(e) => { e.preventDefault(); submit(); }} class="space-y-6">
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label for="library_name" class="block text-sm font-medium text-slate-300 mb-1">Library Name</label>
				<input id="library_name" type="text" bind:value={form.library_name} class={inputCls} />
			</div>
			<div>
				<label for="library_type" class="block text-sm font-medium text-slate-300 mb-1">Library Type</label>
				<select id="library_type" bind:value={form.library_type} class={selectCls}>
					<option value="">Select...</option>
					<option value="16S_amplicon">16S Amplicon</option>
					<option value="18S_amplicon">18S Amplicon</option>
					<option value="CO1_amplicon">CO1 Amplicon</option>
					<option value="12S_amplicon">12S Amplicon</option>
					<option value="nanopore_metagenomic">Nanopore Metagenomic</option>
					<option value="illumina_metagenomic">Illumina Metagenomic</option>
					<option value="rnaseq">RNA-seq</option>
					<option value="other">Other</option>
				</select>
			</div>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label for="library_prep_kit" class="block text-sm font-medium text-slate-300 mb-1">Library Prep Kit</label>
				<input id="library_prep_kit" type="text" bind:value={form.library_prep_kit} class={inputCls} />
			</div>
			<div>
				<label for="library_prep_date" class="block text-sm font-medium text-slate-300 mb-1">Library Prep Date</label>
				<input id="library_prep_date" type="date" bind:value={form.library_prep_date} class={inputCls} />
			</div>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label for="platform" class="block text-sm font-medium text-slate-300 mb-1">Platform</label>
				<select id="platform" bind:value={form.platform} class={selectCls}>
					<option value="">Select...</option>
					{#each SEQUENCING_PLATFORMS as p}
						<option value={p}>{p}</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="instrument_model" class="block text-sm font-medium text-slate-300 mb-1">Instrument Model</label>
				<select id="instrument_model" bind:value={form.instrument_model} class={selectCls}>
					<option value="">Select...</option>
					{#each availableModels as model}
						<option value={model}>{model}</option>
					{/each}
				</select>
			</div>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label for="index_sequence_i7" class="block text-sm font-medium text-slate-300 mb-1">Index Sequence i7</label>
				<input id="index_sequence_i7" type="text" bind:value={form.index_sequence_i7} class="{inputCls} font-mono" />
			</div>
			<div>
				<label for="index_sequence_i5" class="block text-sm font-medium text-slate-300 mb-1">Index Sequence i5</label>
				<input id="index_sequence_i5" type="text" bind:value={form.index_sequence_i5} class="{inputCls} font-mono" />
			</div>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
			<div>
				<label for="barcode" class="block text-sm font-medium text-slate-300 mb-1">Barcode</label>
				<input id="barcode" type="text" bind:value={form.barcode} class={inputCls} />
			</div>
			<div>
				<label for="fragment_size_bp" class="block text-sm font-medium text-slate-300 mb-1">Fragment Size (bp)</label>
				<input id="fragment_size_bp" type="number" bind:value={form.fragment_size_bp} class={inputCls} />
			</div>
			<div>
				<label for="final_concentration_ng_ul" class="block text-sm font-medium text-slate-300 mb-1">Final Concentration (ng/uL)</label>
				<input id="final_concentration_ng_ul" type="number" step="any" bind:value={form.final_concentration_ng_ul} class={inputCls} />
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
			<a href="/libraries/{data.library.id}" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</a>
		</div>
	</form>
</div>
