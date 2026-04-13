<script lang="ts">
	import { goto } from '$app/navigation';
	import { CHECKLIST_OPTIONS, EXTENSION_OPTIONS } from '$lib/mixs/checklists';
	import { organizeForm, orderedOptionalBuckets } from '$lib/mixs/sample-form';
	import { tableLabel } from '$lib/mixs/slot-ownership';
	import PeoplePicker from '$lib/components/PeoplePicker.svelte';
	import FieldLabel from '$lib/components/FieldLabel.svelte';
	import SlotInput from '$lib/components/SlotInput.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let form = $state<Record<string, unknown>>({
		project_id: data.preselectedProjectId as string,
		site_id: data.preselectedSiteId as string,
		mixs_checklist: 'MimarksS',
		extension: 'Water',
		samp_name: '',
		collection_date: '',
		env_medium: ''
	});
	let people = $state<{ personnel_id: string; role?: string | null }[]>([]);
	let saving = $state(false);
	let errorMsg = $state('');

	let availableSites = $derived(
		(data.sites as any[]).filter((s: any) => !form.project_id || s.project_id === form.project_id)
	);
	function onSiteChange() {
		const site = (data.sites as any[]).find((s: any) => s.id === form.site_id);
		if (site && !form.project_id && site.project_id) form.project_id = site.project_id;
	}

	// Reactive organization — rebuckets slots whenever (checklist, extension) changes.
	// picklists are passed through so MIxS enum ranges and SampleTown-local
	// picklists both resolve to inline <select> options on each SlotConfig.
	let organized = $derived(
		organizeForm(form.mixs_checklist as string, (form.extension as string) || null, data.picklists)
	);

	async function submit() {
		if (!form.project_id) { errorMsg = 'Please select a project'; return; }
		if (!form.site_id) { errorMsg = 'Please select a site'; return; }
		if (!(form.samp_name as string)?.trim()) { errorMsg = 'Sample name is required'; return; }

		saving = true;
		errorMsg = '';
		const res = await fetch('/api/samples', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...form, people })
		});
		if (res.ok) {
			const sample = await res.json();
			goto(`/samples/${sample.id}`);
		} else {
			errorMsg = (await res.json().catch(() => ({}))).error || 'Failed to create sample';
			saving = false;
		}
	}

	const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';
	const selectCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500';
	const legendCls = 'text-sm font-semibold text-slate-300 uppercase tracking-wider';
</script>

<div class="max-w-3xl space-y-6">
	<div>
		<a href="/samples" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Samples</a>
		<h1 class="text-2xl font-bold text-white mt-1">New Sample</h1>
	</div>

	<div class="flex gap-1 p-1 bg-slate-800 rounded-lg w-fit">
		<span class="px-4 py-1.5 rounded text-sm font-medium bg-ocean-600 text-white">Single</span>
		<a href="/samples/batch" class="px-4 py-1.5 rounded text-sm font-medium text-slate-400 hover:text-white transition-colors">Batch</a>
	</div>

	{#if errorMsg}
		<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>
	{/if}

	<form onsubmit={(e) => { e.preventDefault(); submit(); }} class="space-y-8">
		<!-- Where: project + site. Site carries lat_lon / geo_loc_name /
		     env_broad_scale / env_local_scale at export time. -->
		<fieldset class="space-y-4">
			<legend class={legendCls}>Where</legend>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label for="project_id" class="block text-sm font-medium text-slate-300 mb-1">Project</label>
					<select id="project_id" bind:value={form.project_id} class={selectCls}>
						<option value="">Select project...</option>
						{#each data.projects as project}
							<option value={project.id}>{project.project_name}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="site_id" class="block text-sm font-medium text-slate-300 mb-1">Site</label>
					<select id="site_id" bind:value={form.site_id} onchange={onSiteChange} class={selectCls}>
						<option value="">Select site...</option>
						{#each availableSites as site}
							<option value={site.id}>{site.site_name}</option>
						{/each}
					</select>
					{#if form.site_id}
						{@const chosen = (data.sites as any[]).find((s: any) => s.id === form.site_id)}
						{#if chosen}
							<p class="text-xs text-slate-500 mt-1">
								{chosen.latitude?.toFixed?.(4) ?? '?'}, {chosen.longitude?.toFixed?.(4) ?? '?'}
								{#if chosen.geo_loc_name} &middot; {chosen.geo_loc_name}{/if}
								<span class="text-slate-600">(inherited)</span>
							</p>
						{/if}
					{/if}
				</div>
			</div>
		</fieldset>

		<!-- Identity: checklist + extension + the three always-present MIxS core slots. -->
		<fieldset class="space-y-4">
			<legend class={legendCls}>Identity</legend>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<FieldLabel slot="samp_name" required />
					<input id="samp_name" type="text" bind:value={form.samp_name}
						class={inputCls} placeholder={data.namingTemplates?.sample_name || 'e.g., eDNA_River_2026_001'} />
				</div>
				<div>
					<FieldLabel slot="collection_date" required />
					<input id="collection_date" type="date" bind:value={form.collection_date} class={inputCls} />
				</div>
			</div>

			<div>
				<FieldLabel slot="env_medium" required />
				<select id="env_medium" bind:value={form.env_medium} class={selectCls}>
					<option value="">Select...</option>
					{#each data.picklists.env_medium as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
				<div>
					<label for="mixs_checklist" class="block text-sm font-medium text-slate-300 mb-1">
						<a href="/glossary" target="_blank" class="hover:text-ocean-400">MIxS Checklist</a>
					</label>
					<select id="mixs_checklist" bind:value={form.mixs_checklist} class={selectCls}>
						{#each CHECKLIST_OPTIONS as opt}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
					<p class="text-xs text-slate-500 mt-1">{CHECKLIST_OPTIONS.find(o => o.value === form.mixs_checklist)?.description}</p>
				</div>
				<div>
					<label for="extension" class="block text-sm font-medium text-slate-300 mb-1">
						<a href="/glossary" target="_blank" class="hover:text-ocean-400">MIxS Extension</a>
					</label>
					<select id="extension" bind:value={form.extension} class={selectCls}>
						<option value="">None</option>
						{#each EXTENSION_OPTIONS as opt}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
					<p class="text-xs text-slate-500 mt-1">{EXTENSION_OPTIONS.find(o => o.value === form.extension)?.description ?? ''}</p>
				</div>
			</div>
		</fieldset>

		<!-- Required — every sample-owned slot the active combination class marks required. -->
		{#if organized.required.length > 0}
			<fieldset class="space-y-4">
				<legend class={legendCls}>
					Required
					<span class="text-rose-400 normal-case tracking-normal font-normal text-xs">
						({organized.required.length})
					</span>
				</legend>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					{#each organized.required as field (field.slot)}
						<SlotInput
							slot={field.slot}
							type={field.type}
							bind:value={form[field.slot]}
							placeholder={field.placeholder}
							required={true}
							options={field.options ?? []}
						/>
					{/each}
				</div>
			</fieldset>
		{/if}

		<!-- Required but on another SampleTown tab. Purely informational —
		     the user goes to that tab to fill these in. -->
		{#if organized.requiredOffSample.length > 0}
			<div class="rounded-lg border border-amber-800 bg-amber-900/10 p-3 text-sm text-amber-200">
				<p class="font-medium mb-1">Also required by {form.mixs_checklist}{form.extension ? ` + ${form.extension}` : ''}:</p>
				<ul class="space-y-0.5 text-xs">
					{#each organized.requiredOffSample as { slot, table }}
						<li>
							<a href="/glossary#{slot}" target="_blank" class="hover:text-amber-100">
								<code class="text-amber-300">{slot}</code>
							</a>
							<span class="text-amber-200/60"> → {tableLabel(table as any)}</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<!-- Recommended — every sample-owned slot the class marks recommended. -->
		{#if organized.recommended.length > 0}
			<details class="group space-y-4" open>
				<summary class="{legendCls} cursor-pointer flex items-center gap-2">
					<span class="text-slate-500 group-open:rotate-90 transition-transform">&#9654;</span>
					Recommended
					<span class="normal-case tracking-normal font-normal text-xs text-slate-500">
						({organized.recommended.length})
					</span>
				</summary>
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
					{#each organized.recommended as field (field.slot)}
						<SlotInput
							slot={field.slot}
							type={field.type}
							bind:value={form[field.slot]}
							placeholder={field.placeholder}
							options={field.options ?? []}
						/>
					{/each}
				</div>
			</details>
		{/if}

		<!-- Optional — grouped by MIxS subset. -->
		{#each orderedOptionalBuckets(organized.optional) as [bucket, fields] (bucket)}
			{#if fields.length > 0}
				<details class="group space-y-4">
					<summary class="{legendCls} cursor-pointer flex items-center gap-2">
						<span class="text-slate-500 group-open:rotate-90 transition-transform">&#9654;</span>
						{bucket}
						<span class="normal-case tracking-normal font-normal text-xs text-slate-500">
							({fields.length})
						</span>
					</summary>
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
						{#each fields as field (field.slot)}
							<SlotInput
								slot={field.slot}
								type={field.type}
								bind:value={form[field.slot]}
								placeholder={field.placeholder}
								options={field.options ?? []}
							/>
						{/each}
					</div>
				</details>
			{/if}
		{/each}

		<!-- People -->
		<PeoplePicker
			bind:people
			personnel={data.personnel}
			roleOptions={data.picklists.person_role}
			label="People"
		/>

		<!-- Notes (SampleTown-local) -->
		<div>
			<label for="notes" class="block text-sm font-medium text-slate-300 mb-1">Notes</label>
			<textarea id="notes" bind:value={form.notes} rows="2" class={inputCls}></textarea>
		</div>

		<div class="flex gap-3 pt-2">
			<button type="submit" disabled={saving}
				class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">
				{saving ? 'Creating...' : 'Create Sample'}
			</button>
			<a href="/samples" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">
				Cancel
			</a>
		</div>
	</form>
</div>
