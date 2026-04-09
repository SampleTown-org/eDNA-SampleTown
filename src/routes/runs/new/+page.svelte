<script lang="ts">
	import { goto } from '$app/navigation';
	import { SEQUENCING_PLATFORMS, INSTRUMENT_MODELS } from '$lib/mixs/controlled-vocab';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	let form = $state({
		run_name: '', run_date: '', platform: 'ILLUMINA', instrument_model: '', seq_meth: '',
		flow_cell_id: '', run_directory: '', fastq_directory: '', total_reads: '', total_bases: '', notes: ''
	});
	let selectedLibraries = $state<string[]>([]);
	let saving = $state(false);
	let errorMsg = $state('');
	let models = $derived(form.platform ? (INSTRUMENT_MODELS[form.platform] || []) : []);

	async function submit() {
		if (!form.run_name.trim() || !form.seq_meth.trim()) { errorMsg = 'Run name and sequencing method are required'; return; }
		saving = true; errorMsg = '';
		const body = { ...form, library_ids: selectedLibraries,
			total_reads: form.total_reads ? +form.total_reads : null, total_bases: form.total_bases ? +form.total_bases : null };
		const res = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (res.ok) { const r = await res.json(); goto(`/runs/${r.id}`); } else { errorMsg = 'Failed to create run'; saving = false; }
	}

	function toggleLibrary(id: string) {
		if (selectedLibraries.includes(id)) {
			selectedLibraries = selectedLibraries.filter(l => l !== id);
		} else {
			selectedLibraries = [...selectedLibraries, id];
		}
	}
</script>

<div class="max-w-2xl space-y-6">
	<div><a href="/runs" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Runs</a>
		<h1 class="text-2xl font-bold text-white mt-1">New Sequencing Run</h1></div>
	{#if errorMsg}<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>{/if}
	<form onsubmit={(e) => { e.preventDefault(); submit(); }} class="space-y-4">
		<div class="grid grid-cols-2 gap-4">
			<div><label for="run_name" class="block text-sm font-medium text-slate-300 mb-1">Run Name *</label>
				<input id="run_name" type="text" bind:value={form.run_name} class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500" placeholder="e.g., RUN-2026-04-09" /></div>
			<div><label for="run_date" class="block text-sm font-medium text-slate-300 mb-1">Run Date</label>
				<input id="run_date" type="date" bind:value={form.run_date} class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500" /></div>
		</div>
		<div class="grid grid-cols-3 gap-4">
			<div><label for="platform" class="block text-sm font-medium text-slate-300 mb-1">Platform *</label>
				<select id="platform" bind:value={form.platform} class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500">
					{#each SEQUENCING_PLATFORMS as p}<option value={p.value}>{p.label}</option>{/each}
				</select></div>
			<div><label for="instrument_model" class="block text-sm font-medium text-slate-300 mb-1">Instrument</label>
				<select id="instrument_model" bind:value={form.instrument_model} class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500">
					<option value="">Select...</option>
					{#each models as m}<option>{m}</option>{/each}
				</select></div>
			<div><label for="seq_meth" class="block text-sm font-medium text-slate-300 mb-1">Seq Method *</label>
				<input id="seq_meth" type="text" bind:value={form.seq_meth} class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500" placeholder="e.g., paired-end 2x300" /></div>
		</div>
		<div class="grid grid-cols-2 gap-4">
			<div><label for="flow_cell_id" class="block text-sm font-medium text-slate-300 mb-1">Flow Cell ID</label>
				<input id="flow_cell_id" type="text" bind:value={form.flow_cell_id} class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500" /></div>
			<div><label for="fastq_directory" class="block text-sm font-medium text-slate-300 mb-1">FASTQ Directory</label>
				<input id="fastq_directory" type="text" bind:value={form.fastq_directory} class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500" placeholder="/path/to/fastqs" /></div>
		</div>

		{#if data.libraries.length > 0}
			<fieldset class="space-y-2">
				<legend class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Attach Libraries</legend>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
					{#each data.libraries as lib}
						<label class="flex items-center gap-2 p-2 rounded border border-slate-800 hover:border-slate-700 cursor-pointer text-sm {selectedLibraries.includes(lib.id) ? 'bg-slate-800 border-ocean-700' : ''}">
							<input type="checkbox" checked={selectedLibraries.includes(lib.id)} onchange={() => toggleLibrary(lib.id)} class="accent-ocean-500" />
							<span class="text-slate-300">{lib.library_name}</span>
							<span class="text-xs text-slate-500">{lib.library_type}</span>
						</label>
					{/each}
				</div>
			</fieldset>
		{/if}

		<div><label for="notes" class="block text-sm font-medium text-slate-300 mb-1">Notes</label>
			<textarea id="notes" bind:value={form.notes} rows="2" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500"></textarea></div>
		<div class="flex gap-3 pt-2">
			<button type="submit" disabled={saving} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">{saving ? 'Creating...' : 'Create Run'}</button>
			<a href="/runs" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</a>
		</div>
	</form>
</div>
