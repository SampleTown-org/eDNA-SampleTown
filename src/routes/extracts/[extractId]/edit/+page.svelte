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
		extraction_kit: data.extract.extraction_kit || '',
		concentration_ng_ul: data.extract.concentration_ng_ul ?? '',
		total_volume_ul: data.extract.total_volume_ul ?? '',
		a260_280: data.extract.a260_280 ?? '',
		a260_230: data.extract.a260_230 ?? '',
		quantification_method: data.extract.quantification_method || '',
		storage_location: data.extract.storage_location || '',
		notes: data.extract.notes || ''
	});

	let saving = $state(false);
	let errorMsg = $state('');

	async function submit() {
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
			errorMsg = (await res.json().catch(() => ({}))).error || 'Failed to update extract';
			saving = false;
		}
	}

	const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';
	const selectCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500';
</script>

<div class="max-w-3xl space-y-6">
	<div>
		<a href="/extracts" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Extracts</a>
		<h1 class="text-2xl font-bold text-white mt-1">Edit {data.extract.extract_name}</h1>
	</div>

	{#if errorMsg}
		<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>
	{/if}

	<form onsubmit={(e) => { e.preventDefault(); submit(); }} class="space-y-6">
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label for="extract_name" class="block text-sm font-medium text-slate-300 mb-1">Extract Name</label>
				<input id="extract_name" type="text" bind:value={form.extract_name} class={inputCls} />
			</div>
			<div>
				<label for="extraction_date" class="block text-sm font-medium text-slate-300 mb-1">Extraction Date</label>
				<input id="extraction_date" type="date" bind:value={form.extraction_date} class={inputCls} />
			</div>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label for="extraction_method" class="block text-sm font-medium text-slate-300 mb-1">Extraction Method</label>
				<input id="extraction_method" type="text" bind:value={form.extraction_method} class={inputCls} />
			</div>
			<div>
				<label for="extraction_kit" class="block text-sm font-medium text-slate-300 mb-1">Extraction Kit</label>
				<input id="extraction_kit" type="text" bind:value={form.extraction_kit} class={inputCls} />
			</div>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label for="concentration_ng_ul" class="block text-sm font-medium text-slate-300 mb-1">Concentration (ng/uL)</label>
				<input id="concentration_ng_ul" type="number" step="any" bind:value={form.concentration_ng_ul} class={inputCls} />
			</div>
			<div>
				<label for="total_volume_ul" class="block text-sm font-medium text-slate-300 mb-1">Total Volume (uL)</label>
				<input id="total_volume_ul" type="number" step="any" bind:value={form.total_volume_ul} class={inputCls} />
			</div>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label for="a260_280" class="block text-sm font-medium text-slate-300 mb-1">A260/280</label>
				<input id="a260_280" type="number" step="any" bind:value={form.a260_280} class={inputCls} />
			</div>
			<div>
				<label for="a260_230" class="block text-sm font-medium text-slate-300 mb-1">A260/230</label>
				<input id="a260_230" type="number" step="any" bind:value={form.a260_230} class={inputCls} />
			</div>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label for="quantification_method" class="block text-sm font-medium text-slate-300 mb-1">Quantification Method</label>
				<select id="quantification_method" bind:value={form.quantification_method} class={selectCls}>
					<option value="">Select...</option>
					<option value="Qubit">Qubit</option>
					<option value="NanoDrop">NanoDrop</option>
					<option value="Bioanalyzer">Bioanalyzer</option>
					<option value="Other">Other</option>
				</select>
			</div>
			<div>
				<label for="storage_location" class="block text-sm font-medium text-slate-300 mb-1">Storage Location</label>
				<input id="storage_location" type="text" bind:value={form.storage_location} class={inputCls} />
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
