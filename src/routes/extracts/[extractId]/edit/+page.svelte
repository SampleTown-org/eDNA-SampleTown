<script lang="ts">
	import { goto } from '$app/navigation';
	import PeoplePicker from '$lib/components/PeoplePicker.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let people = $state<{ personnel_id: string; role?: string | null }[]>(data.people ?? []);

	let form = $state({
		extract_name: data.extract.extract_name || '',
		extraction_date: data.extract.extraction_date || '',
		extraction_method: data.extract.extraction_method || '',
		nucl_acid_ext: data.extract.nucl_acid_ext || '',
		samp_taxon_id: data.extract.samp_taxon_id || '',
		samp_vol_we_dna_ext: data.extract.samp_vol_we_dna_ext || '',
		pool_dna_extracts: data.extract.pool_dna_extracts || '',
		concentration_ng_ul: data.extract.concentration_ng_ul ?? '',
		total_volume_ul: data.extract.total_volume_ul ?? '',
		a260_280: data.extract.a260_280 ?? '',
		a260_230: data.extract.a260_230 ?? '',
		quantification_method: data.extract.quantification_method || '',
		storage_room: data.extract.storage_room || '',
		storage_box: data.extract.storage_box || '',
		notes: data.extract.notes || ''
	});

	let saving = $state(false);
	let errorMsg = $state('');

	async function submit() {
		if (!form.extract_name.trim()) {
			errorMsg = 'Extract name is required';
			return;
		}
		saving = true;
		errorMsg = '';

		const body = {
			...form,
			people,
			concentration_ng_ul: form.concentration_ng_ul === '' ? null : Number(form.concentration_ng_ul),
			total_volume_ul: form.total_volume_ul === '' ? null : Number(form.total_volume_ul),
			a260_280: form.a260_280 === '' ? null : Number(form.a260_280),
			a260_230: form.a260_230 === '' ? null : Number(form.a260_230)
		};
		const res = await fetch(`/api/extracts/${data.extract.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (res.ok) {
			goto(`/extracts/${data.extract.id}`);
		} else {
			const err = await res.json().catch(() => null);
			if (err?.issues?.length) {
				errorMsg = err.issues.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join('; ');
			} else {
				errorMsg = err?.error || 'Failed to update extract';
			}
			saving = false;
		}
	}

	const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';
	const selectCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500';
</script>

<div class="max-w-3xl space-y-6">
	<div>
		<a href="/extracts/{data.extract.id}" class="text-sm text-slate-400 hover:text-ocean-400">&larr; {data.extract.extract_name}</a>
		<h1 class="text-2xl font-bold text-white mt-1">Edit Extract</h1>
	</div>

	{#if errorMsg}
		<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>
	{/if}

	<form onsubmit={(e) => { e.preventDefault(); submit(); }} class="space-y-4">
		<div class="grid grid-cols-2 gap-4">
			<div>
				<label for="extract_name" class="block text-sm font-medium text-slate-300 mb-1">Extract Name *</label>
				<input id="extract_name" type="text" bind:value={form.extract_name} class={inputCls} />
			</div>
			<div>
				<label for="extraction_date" class="block text-sm font-medium text-slate-300 mb-1">Extraction Date</label>
				<input id="extraction_date" type="date" bind:value={form.extraction_date} class={inputCls} />
			</div>
		</div>

		<PeoplePicker
			bind:people
			personnel={data.personnel}
			roleOptions={data.picklists.person_role}
			defaultRole="extractor"
			label="People"
		/>

		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label for="extraction_method" class="block text-sm font-medium text-slate-300 mb-1">
					<a href="/settings?tab=extraction_method" target="_blank" class="hover:text-ocean-400">Method</a>
				</label>
				<select id="extraction_method" bind:value={form.extraction_method} class={selectCls}>
					<option value="">Select...</option>
					{#each data.picklists.extraction_method as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
			</div>
			<div>
				<label for="nucl_acid_ext" class="block text-sm font-medium text-slate-300 mb-1">
					<a href="/glossary#nucl_acid_ext" target="_blank" class="hover:text-ocean-400">Nucleic Acid Extraction Protocol</a>
				</label>
				<input id="nucl_acid_ext" type="text" bind:value={form.nucl_acid_ext} class={inputCls}
					placeholder="DOI or protocol URL (MIxS nucl_acid_ext)" />
			</div>
		</div>

		<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
			<div>
				<label for="samp_taxon_id" class="block text-sm font-medium text-slate-300 mb-1">
					<a href="/glossary#samp_taxon_id" target="_blank" class="hover:text-ocean-400">Taxonomy ID of DNA sample</a>
				</label>
				<input id="samp_taxon_id" type="text" bind:value={form.samp_taxon_id} class={inputCls}
					placeholder="NCBI taxid" />
			</div>
			<div>
				<label for="samp_vol_we_dna_ext" class="block text-sm font-medium text-slate-300 mb-1">
					<a href="/glossary#samp_vol_we_dna_ext" target="_blank" class="hover:text-ocean-400">Sample volume/weight for extraction</a>
				</label>
				<input id="samp_vol_we_dna_ext" type="text" bind:value={form.samp_vol_we_dna_ext} class={inputCls}
					placeholder="e.g. 1500 ml" />
			</div>
			<div>
				<label for="pool_dna_extracts" class="block text-sm font-medium text-slate-300 mb-1">
					<a href="/glossary#pool_dna_extracts" target="_blank" class="hover:text-ocean-400">Pool of DNA extracts</a>
				</label>
				<input id="pool_dna_extracts" type="text" bind:value={form.pool_dna_extracts} class={inputCls}
					placeholder="extract IDs if pooled" />
			</div>
		</div>

		<div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
			<div>
				<label for="concentration_ng_ul" class="block text-sm font-medium text-slate-300 mb-1">Conc. (ng/µL)</label>
				<input id="concentration_ng_ul" type="number" step="any" bind:value={form.concentration_ng_ul} class={inputCls} />
			</div>
			<div>
				<label for="total_volume_ul" class="block text-sm font-medium text-slate-300 mb-1">Volume (µL)</label>
				<input id="total_volume_ul" type="number" step="any" bind:value={form.total_volume_ul} class={inputCls} />
			</div>
			<div>
				<label for="a260_280" class="block text-sm font-medium text-slate-300 mb-1">260/280</label>
				<input id="a260_280" type="number" step="any" bind:value={form.a260_280} class={inputCls} />
			</div>
			<div>
				<label for="a260_230" class="block text-sm font-medium text-slate-300 mb-1">260/230</label>
				<input id="a260_230" type="number" step="any" bind:value={form.a260_230} class={inputCls} />
			</div>
		</div>

		<div class="grid grid-cols-3 gap-4">
			<div>
				<label for="quantification_method" class="block text-sm font-medium text-slate-300 mb-1">Quantification</label>
				<select id="quantification_method" bind:value={form.quantification_method} class={selectCls}>
					<option value="">Select...</option>
					<option>Qubit</option>
					<option>NanoDrop</option>
					<option>Bioanalyzer</option>
					<option>Other</option>
				</select>
			</div>
			<div>
				<label for="storage_room" class="block text-sm font-medium text-slate-300 mb-1">
					<a href="/settings?tab=category" target="_blank" class="hover:text-ocean-400">Room/Freezer</a>
				</label>
				<select id="storage_room" bind:value={form.storage_room} class={selectCls}>
					<option value="">Select...</option>
					{#each data.picklists.storage_room as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
			</div>
			<div>
				<label for="storage_box" class="block text-sm font-medium text-slate-300 mb-1">
					<a href="/settings?tab=category" target="_blank" class="hover:text-ocean-400">Storage Box</a>
				</label>
				<select id="storage_box" bind:value={form.storage_box} class={selectCls}>
					<option value="">Select...</option>
					{#each data.picklists.storage_box as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
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
			<a href="/extracts/{data.extract.id}" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</a>
		</div>
	</form>
</div>
