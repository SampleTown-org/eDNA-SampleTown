<script lang="ts">
	import { goto } from '$app/navigation';
	import PeoplePicker from '$lib/components/PeoplePicker.svelte';
	import { cart } from '$lib/stores/cart.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	let people = $state<{ personnel_id: string; role?: string | null }[]>([]);

	let form = $state({
		run_name: '', run_date: '', platform: '', instrument_model: '', seq_meth: '',
		flow_cell_id: '', run_directory: '', fastq_directory: '', total_reads: '', total_bases: '', notes: ''
	});

	// Cart pre-fill: library plates take priority over individual libraries
	const cartLibPlates = cart.getByType('library_plate');
	const cartLibs = cart.getByType('library');
	const hasCartLibs = cartLibPlates.length > 0 || cartLibs.length > 0;

	// Filter pickers by cart
	const displayPlates = $derived.by(() => {
		const cartIds = cart.idsOfType('library_plate');
		if (cartIds.size === 0) return data.libraryPlates as any[];
		return (data.libraryPlates as any[]).filter((p: any) => cartIds.has(p.id));
	});
	const displayLibraries = $derived.by(() => {
		const cartLibIds = cart.idsOfType('library');
		const cartPlateIds = cart.idsOfType('library_plate');
		if (cartLibIds.size === 0 && cartPlateIds.size === 0) return data.libraries as any[];
		return (data.libraries as any[]).filter((l: any) =>
			cartLibIds.has(l.id) || cartPlateIds.has(l.library_plate_id)
		);
	});

	let sourceType = $state<'plate' | 'individual'>(
		cartLibPlates.length > 0 ? 'plate' : cartLibs.length > 0 ? 'individual' : 'plate'
	);
	let selectedPlateId = $state(cartLibPlates.length > 0 ? cartLibPlates[0].id : '');
	let selectedLibraries = $state<string[]>(
		cartLibs.length > 0 ? cartLibs.map((l) => l.id) : []
	);
	let saving = $state(false);
	let errorMsg = $state('');

	async function loadFromPlate() {
		if (!selectedPlateId) return;
		const plate = (data.libraryPlates as any[]).find((p: any) => p.id === selectedPlateId);
		if (!plate) return;
		// Get all library IDs for this plate
		const res = await fetch(`/api/libraries?plate_id=${selectedPlateId}`);
		if (!res.ok) return;
		const libs = await res.json();
		selectedLibraries = libs.map((l: any) => l.id);
		// Auto-fill platform from plate
		if (plate.platform && !form.platform) form.platform = plate.platform;
	}

	function toggleLibrary(id: string) {
		if (selectedLibraries.includes(id)) {
			selectedLibraries = selectedLibraries.filter(l => l !== id);
		} else {
			selectedLibraries = [...selectedLibraries, id];
		}
	}

	async function submit() {
		if (!form.run_name.trim()) { errorMsg = 'Run name is required'; return; }
		saving = true; errorMsg = '';
		const body = { ...form, library_ids: selectedLibraries, people,
			total_reads: form.total_reads ? +form.total_reads : null, total_bases: form.total_bases ? +form.total_bases : null };
		const res = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (res.ok) {
			if (hasCartLibs) { cart.clearType('library_plate'); cart.clearType('library'); }
			const r = await res.json(); goto(`/runs/${r.id}`);
		}
		else {
			const err = await res.json().catch(() => null);
			if (err?.issues?.length) {
				errorMsg = err.issues.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join('; ');
			} else {
				errorMsg = err?.error || 'Failed to create run';
			}
			saving = false;
		}
	}

	const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';
	const selectCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500';
</script>

<div class="max-w-3xl space-y-6">
	<div><a href="/runs" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Runs</a>
		<h1 class="text-2xl font-bold text-white mt-1">New Sequencing Run</h1></div>
	{#if errorMsg}<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>{/if}
	<form onsubmit={(e) => { e.preventDefault(); submit(); }} class="space-y-4">
		<div class="grid grid-cols-2 gap-4">
			<div><label for="run_name" class="block text-sm font-medium text-slate-300 mb-1">Run Name</label>
				<input id="run_name" type="text" bind:value={form.run_name} class={inputCls} placeholder={data.namingTemplates?.run_name || 'e.g., RUN-2026-04-09'} /></div>
			<div><label for="run_date" class="block text-sm font-medium text-slate-300 mb-1">Run Date</label>
				<input id="run_date" type="date" bind:value={form.run_date} class={inputCls} /></div>
		</div>
		<PeoplePicker
			bind:people
			personnel={data.personnel}
			roleOptions={data.picklists.person_role}
			defaultRole="sequencer operator"
			label="People"
		/>
		<div class="grid grid-cols-3 gap-4">
			<div><label class="block text-sm font-medium text-slate-300 mb-1"><a href="/settings?tab=seq_platform" target="_blank" class="hover:text-ocean-400">Platform</a></label>
				<select bind:value={form.platform} class={selectCls}>
					<option value="">Select...</option>
					{#each data.picklists.seq_platform as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select></div>
			<div><label class="block text-sm font-medium text-slate-300 mb-1"><a href="/settings?tab=seq_instrument" target="_blank" class="hover:text-ocean-400">Instrument</a></label>
				<select bind:value={form.instrument_model} class={selectCls}>
					<option value="">Select...</option>
					{#each data.picklists.seq_instrument as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select></div>
			<div><label class="block text-sm font-medium text-slate-300 mb-1"><a href="/settings?tab=seq_method" target="_blank" class="hover:text-ocean-400">Seq Method</a></label>
				<select bind:value={form.seq_meth} class={selectCls}>
					<option value="">Select...</option>
					{#each data.picklists.seq_method as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select></div>
		</div>
		<div class="grid grid-cols-2 gap-4">
			<div><label for="flow_cell_id" class="block text-sm font-medium text-slate-300 mb-1">Flow Cell ID</label>
				<input id="flow_cell_id" type="text" bind:value={form.flow_cell_id} class={inputCls} /></div>
			<div><label for="fastq_directory" class="block text-sm font-medium text-slate-300 mb-1">FASTQ Directory</label>
				<input id="fastq_directory" type="text" bind:value={form.fastq_directory} class={inputCls} placeholder="/path/to/fastqs" /></div>
		</div>

		<!-- Library source -->
		<fieldset class="space-y-3">
			<legend class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Attach Libraries</legend>
			<div class="flex gap-4 mb-2">
				<label class="flex items-center gap-2 text-sm text-slate-300"><input type="radio" bind:group={sourceType} value="plate" class="accent-ocean-500" /> From Library Plate</label>
				<label class="flex items-center gap-2 text-sm text-slate-300"><input type="radio" bind:group={sourceType} value="individual" class="accent-ocean-500" /> Individual Libraries</label>
			</div>

			{#if sourceType === 'plate'}
				<div class="flex gap-2 items-end">
					<div class="flex-1">
						<select bind:value={selectedPlateId} class={selectCls}>
							<option value="">Select library plate{displayPlates.length < (data.libraryPlates as any[]).length ? ` (${displayPlates.length} from cart)` : ''}...</option>
							{#each displayPlates as p}
								<option value={p.id}>{p.plate_name} ({p.library_count} libraries, {p.library_type})</option>
							{/each}
						</select>
					</div>
					<button type="button" onclick={loadFromPlate} disabled={!selectedPlateId} class="px-3 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 text-sm font-medium">
						Load
					</button>
				</div>
				{#if selectedLibraries.length > 0}
					<p class="text-xs text-slate-400">{selectedLibraries.length} libraries loaded</p>
				{/if}
			{:else}
				{#if displayLibraries.length < (data.libraries as any[]).length}
					<p class="text-[10px] text-ocean-400 mb-1">
						<svg class="w-3 h-3 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M3 4h18l-7 8v5l-4 2V12L3 4z"/></svg>
						showing {displayLibraries.length}/{(data.libraries as any[]).length} from cart
					</p>
				{/if}
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto">
					{#each displayLibraries as lib}
						<label class="flex items-center gap-2 p-2 rounded border border-slate-800 hover:border-slate-700 cursor-pointer text-sm {selectedLibraries.includes(lib.id) ? 'bg-slate-800 border-ocean-700' : ''}">
							<input type="checkbox" checked={selectedLibraries.includes(lib.id)} onchange={() => toggleLibrary(lib.id)} class="accent-ocean-500" />
							<span class="text-slate-300">{lib.library_name}</span>
							<span class="text-xs text-slate-500">{lib.library_type}</span>
						</label>
					{/each}
				</div>
			{/if}
		</fieldset>

		<div><label for="notes" class="block text-sm font-medium text-slate-300 mb-1">Notes</label>
			<textarea id="notes" bind:value={form.notes} rows="2" class={inputCls}></textarea></div>
		<div class="flex gap-3 pt-2">
			<button type="submit" disabled={saving} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">{saving ? 'Creating...' : 'Create Run'}</button>
			<a href="/runs" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</a>
		</div>
	</form>
</div>
