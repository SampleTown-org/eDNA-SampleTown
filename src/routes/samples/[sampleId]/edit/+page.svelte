<script lang="ts">
	import { goto } from '$app/navigation';
	import { CHECKLIST_OPTIONS, EXTENSION_OPTIONS } from '$lib/mixs/checklists';
	import { organizeForm, orderedOptionalBuckets, sanitizeMiscParamName, MISC_PARAM_PREFIX } from '$lib/mixs/sample-form';
	import PeoplePicker from '$lib/components/PeoplePicker.svelte';
	import FieldLabel from '$lib/components/FieldLabel.svelte';
	import GlossaryDoc from '$lib/components/GlossaryDoc.svelte';
	import SlotInput from '$lib/components/SlotInput.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Seed form state from the existing sample row. The server already
	// spreads sample_values onto the sample object, so every EAV-stored
	// slot (silicate, ammonium, misc_param:*, …) arrives as a plain key.
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

	let otherFields = $derived(organized.optional.Other ?? []);
	let otherRecommended = $derived(otherFields.filter((f) => f.recommended));
	let otherRest = $derived(otherFields.filter((f) => !f.recommended));

	// Auto-reveal any non-recommended slot that already has a value saved
	// (so editing an existing sample shows its filled fields in the Other
	// section instead of tucking them away behind Add-parameter).
	let revealed = $state<Set<string>>(new Set(
		Object.entries(form)
			.filter(([k, v]) => v != null && v !== '' && !k.startsWith(MISC_PARAM_PREFIX))
			.map(([k]) => k)
	));
	let miscParamKeys = $derived(Object.keys(form).filter((k) => k.startsWith(MISC_PARAM_PREFIX)));

	let otherRestVisible = $derived(otherRest.filter((f) => revealed.has(f.slot)));
	let otherRestHidden = $derived(otherRest.filter((f) => !revealed.has(f.slot)));

	let addSlotValue = $state<string>('');
	let customName = $state<string>('');

	function onAddSlotChange() {
		const v = addSlotValue;
		if (!v || v === '__custom__') return;
		revealed.add(v);
		revealed = new Set(revealed);
		form[v] ??= '';
		addSlotValue = '';
	}
	function addCustomParam() {
		const name = sanitizeMiscParamName(customName);
		if (!name) return;
		const key = `${MISC_PARAM_PREFIX}${name}`;
		if (!(key in form)) form[key] = '';
		customName = '';
		addSlotValue = '';
	}

	async function submit() {
		if (!form.project_id) { errorMsg = 'Please select a project'; return; }
		if (!form.site_id) { errorMsg = 'Please select a site'; return; }
		if (!(form.samp_name as string)?.trim()) { errorMsg = 'Sample name is required'; return; }

		saving = true;
		errorMsg = '';
		// Server splits known columns from spill (custom MIxS slots +
		// misc_param:* tags) into sample_values EAV rows.
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
				<FieldLabel slot="mixs_checklist" for="mixs_checklist" label="MIxS Checklist" description="Selects the MIxS LinkML class (MIGS, MIMS, MIMARKS-S, MIMARKS-C, etc.) that defines required/recommended parameters for this sample." />
				<select id="mixs_checklist" bind:value={form.mixs_checklist} class={selectCls}>
					{#each CHECKLIST_OPTIONS as opt}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
				<p class="text-xs text-slate-500 mt-1">{CHECKLIST_OPTIONS.find(o => o.value === form.mixs_checklist)?.description}</p>
			</div>
			<div>
				<FieldLabel slot="extension" for="extension" label="MIxS Extension" description="Environmental extension (formerly env_package) — water / soil / host-associated / etc. Narrows required parameters further." />
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
					<FieldLabel slot="project_name" for="project_id" label="Project" required />
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

		<!-- Sampling & Storage (and any other non-Other bucket) — flat render -->
		{#each orderedOptionalBuckets(organized.optional) as [bucket, fields] (bucket)}
			{#if bucket !== 'Other' && fields.length > 0}
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

		<!-- Other — recommended slots inline; rest hidden behind +Add parameter -->
		{#if otherFields.length > 0 || miscParamKeys.length > 0}
			<details class="group space-y-4" open>
				<summary class="{legendCls} cursor-pointer flex items-center gap-2">
					<span class="text-slate-500 group-open:rotate-90 transition-transform">&#9654;</span>
					Other
					<span class="normal-case tracking-normal font-normal text-xs text-slate-500">
						({otherRecommended.length} recommended, {otherRest.length} available)
					</span>
				</summary>

				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
					{#each otherRecommended as field (field.slot)}
						<SlotInput
							slot={field.slot}
							type={field.type}
							bind:value={form[field.slot]}
							placeholder={field.placeholder}
							recommended={true}
							options={field.options ?? []}
						/>
					{/each}

					{#each otherRestVisible as field (field.slot)}
						<SlotInput
							slot={field.slot}
							type={field.type}
							bind:value={form[field.slot]}
							placeholder={field.placeholder}
							options={field.options ?? []}
						/>
					{/each}

					{#each miscParamKeys as key (key)}
						<div>
							<label for={key} class="flex items-center gap-1 text-sm font-medium text-slate-300 mb-1">
								<span class="font-mono text-xs text-slate-500">misc_param:</span><span class="font-mono text-xs text-slate-200">{key.slice(MISC_PARAM_PREFIX.length)}</span>
								<GlossaryDoc slot="misc_param" iconOnly />
							</label>
							<input id={key} type="text" bind:value={form[key]}
								class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500" />
						</div>
					{/each}
				</div>

				<div class="mt-4 flex flex-wrap gap-2 items-center">
					<select
						bind:value={addSlotValue}
						onchange={onAddSlotChange}
						class="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-ocean-500"
					>
						<option value="">+ Add parameter...</option>
						{#if otherRestHidden.length > 0}
							<optgroup label="MIxS optional parameters">
								{#each otherRestHidden as f (f.slot)}
									<option value={f.slot}>{f.slot}</option>
								{/each}
							</optgroup>
						{/if}
						<option value="__custom__">additional parameter (misc_param:…)</option>
					</select>

					{#if addSlotValue === '__custom__'}
						<input
							type="text"
							bind:value={customName}
							placeholder="parameter name (e.g., Bicarbonate concentration)"
							class="flex-1 min-w-48 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-ocean-500"
						/>
						<button
							type="button"
							onclick={addCustomParam}
							class="px-3 py-2 bg-ocean-700 hover:bg-ocean-600 rounded-lg text-white text-sm font-medium"
						>
							Add
						</button>
					{/if}
				</div>
			</details>
		{/if}

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
