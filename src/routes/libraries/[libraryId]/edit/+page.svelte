<script lang="ts">
	import { goto } from '$app/navigation';
	import PeoplePicker from '$lib/components/PeoplePicker.svelte';
	import FieldLabel from '$lib/components/FieldLabel.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// ============ Plate-edit branch ============
	let plateForm = $state(
		data.type === 'plate'
			? {
					plate_name: (data.plate as any).plate_name || '',
					library_prep_date: (data.plate as any).library_prep_date || '',
					library_type: (data.plate as any).library_type || '',
					library_source: (data.plate as any).library_source || '',
					library_selection: (data.plate as any).library_selection || '',
					library_prep_kit: (data.plate as any).library_prep_kit || '',
					fragment_size_bp: (data.plate as any).fragment_size_bp ?? '',
					notes: (data.plate as any).notes || ''
				}
			: ({} as any)
	);
	let platePeople = $state<{ personnel_id: string; role?: string | null }[]>(
		data.type === 'plate' ? data.people ?? [] : []
	);

	// ============ Library-edit branch ============
	// Mirrors the per-row table on libraries/new — only the fields that vary
	// row-to-row in the create form. The plate-level fields (library_type,
	// library_prep_kit, library_prep_date, platform, instrument_model,
	// fragment_size_bp) are inherited from the plate at create time and
	// passed back through the API unchanged here so we don't null them out.
	let form = $state(
		data.type === 'library'
			? {
					library_name: (data.library as any).library_name || '',
					index_sequence_i7: (data.library as any).index_sequence_i7 || '',
					index_sequence_i5: (data.library as any).index_sequence_i5 || '',
					barcode: (data.library as any).barcode || '',
					final_concentration_ng_ul: (data.library as any).final_concentration_ng_ul ?? '',
					notes: (data.library as any).notes || ''
				}
			: ({} as any)
	);

	let saving = $state(false);
	let errorMsg = $state('');

	async function submitPlate() {
		if (!plateForm.plate_name.trim()) { errorMsg = 'Plate name is required'; return; }
		if (!plateForm.library_type) { errorMsg = 'Library Strategy (SRA) is required — pick one from the dropdown'; return; }
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
		if (!form.library_name.trim()) {
			errorMsg = 'Library name is required';
			return;
		}
		saving = true;
		errorMsg = '';

		// Inherit unchanged plate-level fields from the existing row so the
		// PUT handler doesn't null them out.
		const body = {
			library_type: (data.library as any).library_type,
			library_prep_kit: (data.library as any).library_prep_kit,
			library_prep_date: (data.library as any).library_prep_date,
			platform: (data.library as any).platform,
			instrument_model: (data.library as any).instrument_model,
			fragment_size_bp: (data.library as any).fragment_size_bp,
			...form,
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
					<FieldLabel slot="library_strategy" for="library_type" label="Library Strategy (SRA)" picklistCategory="library_strategy" description="SRA library strategy — AMPLICON, WGS, RNA-Seq, etc." />
					<select id="library_type" bind:value={plateForm.library_type} class={selectCls}>
						<option value="">Select...</option>
						{#each data.picklists.library_strategy ?? [] as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select>
				</div>
				<div>
					<FieldLabel slot="library_prep_kit" for="library_prep_kit" label="Prep Kit" picklistCategory="library_prep_kit" description="Commercial kit used for library preparation." />
					<select id="library_prep_kit" bind:value={plateForm.library_prep_kit} class={selectCls}>
						<option value="">Select...</option>
						{#each data.picklists.library_prep_kit ?? [] as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select>
				</div>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<FieldLabel slot="library_source" for="library_source" label="Source (SRA)" picklistCategory="library_source" description="SRA library source — GENOMIC, METAGENOMIC, TRANSCRIPTOMIC, etc." />
					<select id="library_source" bind:value={plateForm.library_source} class={selectCls}>
						<option value="">Select...</option>
						{#each data.picklists.library_source ?? [] as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select>
				</div>
				<div>
					<FieldLabel slot="library_selection" for="library_selection" label="Selection (SRA)" picklistCategory="library_selection" description="SRA library selection — RANDOM, PCR, cDNA, etc." />
					<select id="library_selection" bind:value={plateForm.library_selection} class={selectCls}>
						<option value="">Select...</option>
						{#each data.picklists.library_selection ?? [] as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select>
				</div>
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
		<form onsubmit={(e) => { e.preventDefault(); submit(); }} class="space-y-4">
			<div>
				<label for="library_name" class="block text-sm font-medium text-slate-300 mb-1">Library Name *</label>
				<input id="library_name" type="text" bind:value={form.library_name} class={inputCls} />
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label for="index_sequence_i7" class="block text-sm font-medium text-slate-300 mb-1">i7 Index</label>
					<input id="index_sequence_i7" type="text" bind:value={form.index_sequence_i7} class={inputCls} placeholder="e.g., N701 or TAAGGCGA" />
				</div>
				<div>
					<label for="index_sequence_i5" class="block text-sm font-medium text-slate-300 mb-1">i5 Index</label>
					<input id="index_sequence_i5" type="text" bind:value={form.index_sequence_i5} class={inputCls} placeholder="e.g., S501 or TAGATCGC" />
				</div>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<FieldLabel slot="barcode" for="barcode" label="Barcode" picklistCategory="barcode" description="Barcode ID from the library prep kit (ONT BC01–BC96, Illumina i7 label, etc.)." />
					<select id="barcode" bind:value={form.barcode} class={selectCls}>
						<option value="">—</option>
						{#each data.picklists.barcode ?? [] as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select>
				</div>
				<div>
					<label for="final_concentration_ng_ul" class="block text-sm font-medium text-slate-300 mb-1">Final Concentration (ng/µL)</label>
					<input id="final_concentration_ng_ul" type="number" step="any" bind:value={form.final_concentration_ng_ul} class={inputCls} />
				</div>
			</div>
			<div>
				<label for="notes" class="block text-sm font-medium text-slate-300 mb-1">Notes</label>
				<textarea id="notes" bind:value={form.notes} rows="2" class={inputCls}></textarea>
			</div>

			<p class="text-xs text-slate-500">
				Editing per-library fields only. Plate-level settings (library type, prep
				kit, instrument, fragment size) are inherited from the parent plate and
				can be changed by editing the plate.
			</p>

			<div class="flex gap-3 pt-2">
				<button type="submit" disabled={saving} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">
					{saving ? 'Saving...' : 'Save'}
				</button>
				<a href="/libraries/{(data.library as any).id}" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</a>
			</div>
		</form>
	{/if}
</div>
