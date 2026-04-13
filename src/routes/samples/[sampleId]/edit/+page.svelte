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

	// Seed form state from the existing sample row — keep every column so the
	// bound inputs don't trip over missing keys when buckets shift.
	const sample = data.sample as Record<string, unknown>;
	let form = $state<Record<string, unknown>>({
		...sample,
		mixs_checklist: (sample.mixs_checklist as string) || 'MimarksS',
		extension: (sample.extension as string) || '',
		samp_name: (sample.samp_name as string) || '',
		collection_date: (sample.collection_date as string) || '',
		env_medium: (sample.env_medium as string) || '',
		notes: (sample.notes as string) || ''
	});
	let people = $state<{ personnel_id: string; role?: string | null }[]>(
		((data as any).people ?? []) as { personnel_id: string; role?: string | null }[]
	);
	let saving = $state(false);
	let errorMsg = $state('');

	let availableSites = $derived(
		(data.sites as any[]).filter((s: any) => !form.project_id || s.project_id === form.project_id)
	);
	function onSiteChange() {
		const site = (data.sites as any[]).find((s: any) => s.id === form.site_id);
		if (site && !form.project_id && site.project_id) form.project_id = site.project_id;
	}

	let organized = $derived(
		organizeForm(form.mixs_checklist as string, (form.extension as string) || null, data.picklists)
	);

	async function submit() {
		if (!form.project_id) { errorMsg = 'Please select a project'; return; }
		if (!form.site_id) { errorMsg = 'Please select a site'; return; }
		if (!(form.samp_name as string)?.trim()) { errorMsg = 'Sample name is required'; return; }

		saving = true;
		errorMsg = '';
		const res = await fetch(`/api/samples/${(data.sample as any).id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...form, people })
		});
		if (res.ok) {
			goto(`/samples/${(data.sample as any).id}`);
		} else {
			const err = await res.json().catch(() => null);
			errorMsg = err?.issues?.length
				? err.issues.map((i: { path: string; message: string }) => `${i.path}: ${i.message}`).join('; ')
				: err?.error || 'Failed to update sample';
			saving = false;
		}
	}

	const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';
	const selectCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500';
	const legendCls = 'text-sm font-semibold text-slate-300 uppercase tracking-wider';

	const PROJECT_DESCRIPTION = 'SampleTown project this sample belongs to. On MIxS export, the project name is emitted from the project record.';
	const SITE_DESCRIPTION = 'SampleTown site where this sample was collected. Sites own the MIxS location slots (lat_lon, geo_loc_name, env_broad_scale, env_local_scale) and pass them through to the sample on export.';
</script>

<div class="max-w-3xl space-y-6">
	<div>
		<a href="/samples/{(data.sample as any).id}" class="text-sm text-slate-400 hover:text-ocean-400">&larr; {(data.sample as any).samp_name}</a>
		<h1 class="text-2xl font-bold text-white mt-1">Edit Sample</h1>
	</div>

	{#if errorMsg}
		<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>
	{/if}

	<form onsubmit={(e) => { e.preventDefault(); submit(); }} class="space-y-8">
		<!-- Top: checklist + extension drive every bucket below. -->
		<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-lg border border-slate-800 bg-slate-900/40">
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

		<!-- Required: project + site + samp_name + date + env_medium, plus every
		     MIxS-required slot the active combination class lists. -->
		<fieldset class="space-y-4">
			<legend class={legendCls}>
				Required
				<span class="text-rose-400 normal-case tracking-normal font-normal text-xs">
					({5 + organized.required.length})
				</span>
			</legend>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<FieldLabel slot="project_id" label="Project" required description={PROJECT_DESCRIPTION} />
					<select id="project_id" bind:value={form.project_id} class={selectCls}>
						<option value="">Select project...</option>
						{#each data.projects as project}
							<option value={project.id}>{project.project_name}</option>
						{/each}
					</select>
				</div>
				<div>
					<FieldLabel slot="site_id" label="Site" required description={SITE_DESCRIPTION} />
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

				<div>
					<FieldLabel slot="samp_name" required />
					<input id="samp_name" type="text" bind:value={form.samp_name}
						class={inputCls} placeholder={(data as any).namingTemplates?.sample_name || 'e.g., eDNA_River_2026_001'} />
				</div>
				<div>
					<FieldLabel slot="collection_date" required />
					<input id="collection_date" type="date" bind:value={form.collection_date} class={inputCls} />
				</div>

				<div class="sm:col-span-2">
					<FieldLabel slot="env_medium" required />
					<select id="env_medium" bind:value={form.env_medium} class={selectCls}>
						<option value="">Select...</option>
						{#each data.picklists.env_medium as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select>
				</div>

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

		<!-- Required but on another SampleTown tab. Purely informational. -->
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

		<!-- Optional buckets — recommended slots appear here with an amber `*`. -->
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
								recommended={field.recommended ?? false}
								options={field.options ?? []}
							/>
						{/each}
					</div>
				</details>
			{/if}
		{/each}

		<PeoplePicker
			bind:people
			personnel={data.personnel}
			roleOptions={data.picklists.person_role}
			label="People"
		/>

		<div>
			<label for="notes" class="block text-sm font-medium text-slate-300 mb-1">Notes</label>
			<textarea id="notes" bind:value={form.notes} rows="2" class={inputCls}></textarea>
		</div>

		<div class="flex gap-3 pt-2">
			<button type="submit" disabled={saving}
				class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">
				{saving ? 'Updating...' : 'Update Sample'}
			</button>
			<a href="/samples/{(data.sample as any).id}" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">
				Cancel
			</a>
		</div>
	</form>
</div>
