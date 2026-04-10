<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let form = $state({
		run_name: data.run.run_name || '',
		run_date: data.run.run_date || '',
		platform: data.run.platform || '',
		instrument_model: data.run.instrument_model || '',
		seq_meth: data.run.seq_meth || '',
		flow_cell_id: data.run.flow_cell_id || '',
		run_directory: data.run.run_directory || '',
		fastq_directory: data.run.fastq_directory || '',
		total_reads: data.run.total_reads ?? '',
		total_bases: data.run.total_bases ?? '',
		notes: data.run.notes || ''
	});

	let saving = $state(false);
	let errorMsg = $state('');

	async function submit() {
		saving = true;
		errorMsg = '';

		const body = {
			...form,
			total_reads: form.total_reads === '' ? null : Number(form.total_reads),
			total_bases: form.total_bases === '' ? null : Number(form.total_bases)
		};
		const res = await fetch(`/api/runs/${data.run.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (res.ok) {
			goto(`/runs/${data.run.id}`);
		} else {
			errorMsg = 'Failed to update run';
			saving = false;
		}
	}

	const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';
	const selectCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500';
</script>

<div class="max-w-3xl space-y-6">
	<div>
		<a href="/runs" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Runs</a>
		<h1 class="text-2xl font-bold text-white mt-1">Edit {data.run.run_name}</h1>
	</div>

	{#if errorMsg}
		<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>
	{/if}

	<form onsubmit={(e) => { e.preventDefault(); submit(); }} class="space-y-6">
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label for="run_name" class="block text-sm font-medium text-slate-300 mb-1">Run Name</label>
				<input id="run_name" type="text" bind:value={form.run_name} class={inputCls} />
			</div>
			<div>
				<label for="run_date" class="block text-sm font-medium text-slate-300 mb-1">Run Date</label>
				<input id="run_date" type="date" bind:value={form.run_date} class={inputCls} />
			</div>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label for="platform" class="block text-sm font-medium text-slate-300 mb-1">Platform</label>
				<select id="platform" bind:value={form.platform} class={selectCls}>
					<option value="">Select...</option>
					<option value="ILLUMINA">ILLUMINA</option>
					<option value="OXFORD_NANOPORE">OXFORD_NANOPORE</option>
					<option value="PACBIO">PACBIO</option>
					<option value="ION_TORRENT">ION_TORRENT</option>
				</select>
			</div>
			<div>
				<label for="instrument_model" class="block text-sm font-medium text-slate-300 mb-1">Instrument Model</label>
				<input id="instrument_model" type="text" bind:value={form.instrument_model} class={inputCls} />
			</div>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label for="seq_meth" class="block text-sm font-medium text-slate-300 mb-1">Sequencing Method</label>
				<input id="seq_meth" type="text" bind:value={form.seq_meth} class={inputCls} />
			</div>
			<div>
				<label for="flow_cell_id" class="block text-sm font-medium text-slate-300 mb-1">Flow Cell ID</label>
				<input id="flow_cell_id" type="text" bind:value={form.flow_cell_id} class={inputCls} />
			</div>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label for="run_directory" class="block text-sm font-medium text-slate-300 mb-1">Run Directory</label>
				<input id="run_directory" type="text" bind:value={form.run_directory} class={inputCls} />
			</div>
			<div>
				<label for="fastq_directory" class="block text-sm font-medium text-slate-300 mb-1">FASTQ Directory</label>
				<input id="fastq_directory" type="text" bind:value={form.fastq_directory} class={inputCls} />
			</div>
		</div>
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
			<div>
				<label for="total_reads" class="block text-sm font-medium text-slate-300 mb-1">Total Reads</label>
				<input id="total_reads" type="number" bind:value={form.total_reads} class={inputCls} />
			</div>
			<div>
				<label for="total_bases" class="block text-sm font-medium text-slate-300 mb-1">Total Bases</label>
				<input id="total_bases" type="number" bind:value={form.total_bases} class={inputCls} />
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
			<a href="/runs/{data.run.id}" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</a>
		</div>
	</form>
</div>
