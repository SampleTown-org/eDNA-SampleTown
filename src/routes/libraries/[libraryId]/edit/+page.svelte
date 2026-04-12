<script lang="ts">
	import { goto } from '$app/navigation';
	import { SEQUENCING_PLATFORMS, INSTRUMENT_MODELS } from '$lib/mixs/controlled-vocab';
	import PeoplePicker from '$lib/components/PeoplePicker.svelte';
	import { inferPlatformFromInstrument } from '$lib/platform-infer';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// ============ Plate-edit branch ============
	let plateForm = $state(
		data.type === 'plate'
			? {
					plate_name: (data.plate as any).plate_name || '',
					library_prep_date: (data.plate as any).library_prep_date || '',
					library_type: (data.plate as any).library_type || '',
					library_prep_kit: (data.plate as any).library_prep_kit || '',
					instrument_model: (data.plate as any).instrument_model || '',
					platform: (data.plate as any).platform || '',
					fragment_size_bp: (data.plate as any).fragment_size_bp ?? '',
					notes: (data.plate as any).notes || ''
				}
			: ({} as any)
	);
	let platePeople = $state<{ personnel_id: string; role?: string | null }[]>(
		data.type === 'plate' ? data.people ?? [] : []
	);

	// Re-infer platform from the chosen instrument so the picker can stay
	// hidden — matches the create page UX.
	const inferredPlatePlatform = $derived(
		data.type === 'plate'
			? inferPlatformFromInstrument(plateForm.instrument_model) ??
					(plateForm.instrument_model ? 'other' : '')
			: ''
	);
	$effect(() => {
		if (data.type === 'plate') plateForm.platform = inferredPlatePlatform;
	});

	// ============ Library-edit branch (legacy, unchanged) ============
	let form = $state(
		data.type === 'library'
			? {
					library_name: (data.library as any).library_name || '',
					library_type: (data.library as any).library_type || '',
					library_prep_kit: (data.library as any).library_prep_kit || '',
					library_prep_date: (data.library as any).library_prep_date || '',
					platform: (data.library as any).platform || '',
					instrument_model: (data.library as any).instrument_model || '',
					index_sequence_i7: (data.library as any).index_sequence_i7 || '',
					index_sequence_i5: (data.library as any).index_sequence_i5 || '',
					barcode: (data.library as any).barcode || '',
					fragment_size_bp: (data.library as any).fragment_size_bp ?? '',
					final_concentration_ng_ul: (data.library as any).final_concentration_ng_ul ?? '',
					notes: (data.library as any).notes || ''
				}
			: ({} as any)
	);

	let availableModels = $derived(
		data.type === 'library' && form.platform ? INSTRUMENT_MODELS[form.platform] || [] : []
	);

	let saving = $state(false);
	let errorMsg = $state('');

	async function submitPlate() {
		if (!plateForm.plate_name.trim()) { errorMsg = 'Plate name is required'; return; }
		if (!plateForm.library_type) { errorMsg = 'Library type is required'; return; }
		saving = true; errorMsg = '';

		const body = {
			...plateForm,
			people: platePeople,
			fragment_size_bp: plateForm.fragment_size_bp === '' ? null : Number(plateForm.fragment_size_bp)
		};
		const res = await fetch(`/api/library-plates/${(data.plate as any).id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (res.ok) {
			goto(`/libraries/${(data.plate as any).id}`);
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

	async function submit() {
		saving = true;
		errorMsg = '';

		const body = {
			...form,
			fragment_size_bp: form.fragment_size_bp === '' ? null : Number(form.fragment_size_bp),
			final_concentration_ng_ul: form.final_concentration_ng_ul === '' ? null : Number(form.final_concentration_ng_ul)
		};
		const res = await fetch(`/api/libraries/${(data.library as any).id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (res.ok) {
			goto(`/libraries/${(data.library as any).id}`);
		} else {
			errorMsg = (await res.json().catch(() => ({}))).error || 'Failed to update library';
			saving = false;
		}
	}

	const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';
	const selectCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500';
</script>

<div class="max-w-3xl space-y-6">
	<div>
		<a href="/libraries" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Libraries</a>
		{#if data.type === 'plate'}
			<h1 class="text-2xl font-bold text-white mt-1">Edit Plate {(data.plate as any).plate_name}</h1>
		{:else}
			<h1 class="text-2xl font-bold text-white mt-1">Edit {(data.library as any).library_name}</h1>
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
					<label for="library_prep_date" class="block text-sm font-medium text-slate-300 mb-1">Prep Date</label>
					<input id="library_prep_date" type="date" bind:value={plateForm.library_prep_date} class={inputCls} />
				</div>
			</div>

			<PeoplePicker
				bind:people={platePeople}
				personnel={data.personnel}
				roleOptions={data.picklists.person_role}
				defaultRole="library prep"
				label="People"
			/>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label for="library_type" class="block text-sm font-medium text-slate-300 mb-1">
						<a href="/settings?tab=category" target="_blank" class="hover:text-ocean-400">Library Type</a>
					</label>
					<select id="library_type" bind:value={plateForm.library_type} class={selectCls}>
						<option value="">Select...</option>
						{#each data.picklists.library_type ?? [] as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select>
				</div>
				<div>
					<label for="library_prep_kit" class="block text-sm font-medium text-slate-300 mb-1">
						<a href="/settings?tab=category" target="_blank" class="hover:text-ocean-400">Prep Kit</a>
					</label>
					<select id="library_prep_kit" bind:value={plateForm.library_prep_kit} class={selectCls}>
						<option value="">Select...</option>
						{#each data.picklists.library_prep_kit ?? [] as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select>
				</div>
			</div>

			<div>
				<label for="instrument_model" class="block text-sm font-medium text-slate-300 mb-1">
					<a href="/settings?tab=category" target="_blank" class="hover:text-ocean-400">Instrument</a>
				</label>
				<select id="instrument_model" bind:value={plateForm.instrument_model} class={selectCls}>
					<option value="">Select...</option>
					{#each data.picklists.seq_instrument ?? [] as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
				{#if inferredPlatePlatform}
					<p class="text-xs text-slate-500 mt-1">
						Platform: <span class="text-slate-300">{inferredPlatePlatform}</span>
						<span class="text-slate-600">(inferred)</span>
					</p>
				{/if}
			</div>

			<div>
				<label class="block text-sm font-medium text-slate-300 mb-1">Fragment Size (bp)</label>
				<input type="number" bind:value={plateForm.fragment_size_bp} class={inputCls} />
			</div>

			<div>
				<label class="block text-sm font-medium text-slate-300 mb-1">Notes</label>
				<textarea bind:value={plateForm.notes} rows="2" class={inputCls}></textarea>
			</div>

			<p class="text-xs text-slate-500">
				Editing plate-level fields only. To edit an individual library, open it
				from the plate detail page.
			</p>

			<div class="flex gap-3 pt-2">
				<button type="submit" disabled={saving} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">
					{saving ? 'Saving...' : 'Save'}
				</button>
				<a href="/libraries/{(data.plate as any).id}" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</a>
			</div>
		</form>

	{:else}
		<form onsubmit={(e) => { e.preventDefault(); submit(); }} class="space-y-6">
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label for="library_name" class="block text-sm font-medium text-slate-300 mb-1">Library Name</label>
					<input id="library_name" type="text" bind:value={form.library_name} class={inputCls} />
				</div>
				<div>
					<label for="library_type_l" class="block text-sm font-medium text-slate-300 mb-1">Library Type</label>
					<select id="library_type_l" bind:value={form.library_type} class={selectCls}>
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
				<a href="/libraries/{(data.library as any).id}" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</a>
			</div>
		</form>
	{/if}
</div>
