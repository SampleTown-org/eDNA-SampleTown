<script lang="ts">
	import { goto } from '$app/navigation';
	import { CHECKLIST_OPTIONS } from '$lib/mixs/checklists';
	import { ENV_PACKAGES } from '$lib/mixs/controlled-vocab';
	import { CORE_FIELDS, PACKAGE_FIELDS, MEASUREMENT_FIELDS, LOGISTICS_FIELDS } from '$lib/mixs/fields';
	import PeoplePicker from '$lib/components/PeoplePicker.svelte';
	import type { EnvPackage, MixsChecklist } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let form = $state<Record<string, unknown>>({
		project_id: data.preselectedProjectId as string,
		site_id: data.preselectedSiteId as string,
		mixs_checklist: 'MIMARKS-SU',
		samp_name: '',
		collection_date: '',
		env_medium: ''
	});

	/** env_package is a UI-only filter for showing package-specific fields — not saved to DB. */
	let envPackage = $state<EnvPackage>('water');

	let people = $state<{ personnel_id: string; role?: string | null }[]>([]);

	// Sites filtered by selected project
	let availableSites = $derived(
		(data.sites as any[]).filter((s: any) => !form.project_id || s.project_id === form.project_id)
	);

	// Auto-fill project from site if not set
	function onSiteChange() {
		const site = (data.sites as any[]).find((s: any) => s.id === form.site_id);
		if (site && !form.project_id && site.project_id) {
			form.project_id = site.project_id;
		}
	}

	let saving = $state(false);
	let errorMsg = $state('');

	let packageFields = $derived(PACKAGE_FIELDS[envPackage] || []);

	async function submit() {
		if (!form.project_id) {
			errorMsg = 'Please select a project';
			return;
		}
		if (!form.site_id) {
			errorMsg = 'Please select a site';
			return;
		}
		if (!(form.samp_name as string)?.trim()) {
			errorMsg = 'Sample name is required';
			return;
		}

		saving = true;
		errorMsg = '';

		const body = { ...form, people };
		const res = await fetch('/api/samples', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
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
</script>

<div class="max-w-3xl space-y-6">
	<div>
		<a href="/samples" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Samples</a>
		<h1 class="text-2xl font-bold text-white mt-1">New Sample</h1>
	</div>

	<!-- Single / Batch toggle -->
	<div class="flex gap-1 p-1 bg-slate-800 rounded-lg w-fit">
		<span class="px-4 py-1.5 rounded text-sm font-medium bg-ocean-600 text-white">Single</span>
		<a href="/samples/batch" class="px-4 py-1.5 rounded text-sm font-medium text-slate-400 hover:text-white transition-colors">Batch</a>
	</div>

	{#if errorMsg}
		<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>
	{/if}

	<form onsubmit={(e) => { e.preventDefault(); submit(); }} class="space-y-8">
		<!-- Where: project + site. Site is required; lat/lng/geo_loc/env scales
		     are inherited from the selected site at save time. -->
		<fieldset class="space-y-4">
			<legend class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Where</legend>

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

		<!-- Sample: name, date, env_medium. Everything else is inherited from
		     site or hidden behind the "Add MIxS metadata" section below. -->
		<fieldset class="space-y-4">
			<legend class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Sample</legend>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label for="samp_name" class="block text-sm font-medium text-slate-300 mb-1">Sample Name</label>
					<input id="samp_name" type="text" bind:value={form.samp_name}
						class="{inputCls} border-slate-700" placeholder={data.namingTemplates?.sample_name || 'e.g., eDNA_River_2026_001'} />
				</div>
				<div>
					<label for="collection_date" class="block text-sm font-medium text-slate-300 mb-1">Collection Date</label>
					<input id="collection_date" type="date" bind:value={form.collection_date}
						class="{inputCls} border-slate-700" />
				</div>
			</div>

			<div>
				<label for="env_medium" class="block text-sm font-medium text-slate-300 mb-1"><a href="/settings?tab=env_medium" target="_blank" class="hover:text-ocean-400">Environmental Medium</a></label>
				<select id="env_medium" bind:value={form.env_medium}
					class="{selectCls} border-slate-700">
					<option value="">Select...</option>
					{#each data.picklists.env_medium as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
			</div>
		</fieldset>

		<!-- Add MIxS metadata (collapsed): checklist + env package picker.
		     Package selection drives the package-specific fields section below. -->
		<details class="group rounded-lg border border-slate-800 bg-slate-900/40">
			<summary class="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white cursor-pointer flex items-center gap-2">
				<span class="text-slate-500 group-open:rotate-90 transition-transform">&#9654;</span>
				Add MIxS metadata
				<span class="text-xs text-slate-500 font-normal">
					(checklist, package, package-specific fields)
				</span>
			</summary>
			<div class="p-4 space-y-4 border-t border-slate-800">
				<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<div>
						<label for="mixs_checklist" class="block text-sm font-medium text-slate-300 mb-1">MIxS Checklist</label>
						<select id="mixs_checklist" bind:value={form.mixs_checklist} class={selectCls}>
							{#each CHECKLIST_OPTIONS as opt}
								<option value={opt.value}>{opt.label}</option>
							{/each}
						</select>
						<p class="text-xs text-slate-500 mt-1">{CHECKLIST_OPTIONS.find(o => o.value === form.mixs_checklist)?.description}</p>
					</div>
					<div>
						<label for="env_package" class="block text-sm font-medium text-slate-300 mb-1">Env Package <span class="text-xs text-slate-500 font-normal">(field filter only)</span></label>
						<select id="env_package" bind:value={envPackage} class={selectCls}>
							{#each ENV_PACKAGES as pkg}
								<option value={pkg.value}>{pkg.label}</option>
							{/each}
						</select>
					</div>
				</div>
			</div>
		</details>

		<!-- Package-specific fields -->
		{#if packageFields.length > 0}
			<fieldset class="space-y-4">
				<legend class="text-sm font-semibold text-slate-300 uppercase tracking-wider">{envPackage} Package Fields</legend>
				{#each packageFields as field}
					<div>
						<label for={field.name} class="block text-sm font-medium text-slate-300 mb-1">
							{field.label} {field.unit ? `(${field.unit})` : ''}
						</label>
						<input id={field.name} type="text" bind:value={form[field.name]}
							class="{inputCls} border-slate-700" placeholder={field.placeholder} />
					</div>
				{/each}
			</fieldset>
		{/if}

		<!-- People -->
		<PeoplePicker
			bind:people
			personnel={data.personnel}
			roleOptions={data.picklists.person_role}
			label="People"
		/>

		<!-- Measurements (collapsible) -->
		<details class="group">
			<summary class="text-sm font-semibold text-slate-300 uppercase tracking-wider cursor-pointer flex items-center gap-2">
				<span class="text-slate-500 group-open:rotate-90 transition-transform">&#9654;</span>
				Environmental Measurements
			</summary>
			<div class="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
				{#each MEASUREMENT_FIELDS as field}
					<div>
						<label for={field.name} class="block text-sm font-medium text-slate-300 mb-1">
							{field.label} {field.unit ? `(${field.unit})` : ''}
						</label>
						<input id={field.name} type="number" step="any" bind:value={form[field.name]}
							class="{inputCls} border-slate-700" />
					</div>
				{/each}
			</div>
		</details>

		<!-- Logistics (collapsible) -->
		<details class="group">
			<summary class="text-sm font-semibold text-slate-300 uppercase tracking-wider cursor-pointer flex items-center gap-2">
				<span class="text-slate-500 group-open:rotate-90 transition-transform">&#9654;</span>
				Sample Logistics
			</summary>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
				{#each LOGISTICS_FIELDS as field}
					<div>
						<label for={field.name} class="block text-sm font-medium text-slate-300 mb-1">{field.label}</label>
						{#if field.constrainedCategory && data.picklists[field.constrainedCategory]}
							<select id={field.name} bind:value={form[field.name]} class={selectCls}>
								<option value="">Select...</option>
								{#each data.picklists[field.constrainedCategory] as opt}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						{:else if field.type === 'select' && field.options}
							<select id={field.name} bind:value={form[field.name]} class={selectCls}>
								<option value="">Select...</option>
								{#each field.options as opt}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						{:else if field.type === 'number'}
							<input id={field.name} type="number" step="any" bind:value={form[field.name]}
								class="{inputCls} border-slate-700" placeholder={field.placeholder} />
						{:else}
							<input id={field.name} type="text" bind:value={form[field.name]}
								class="{inputCls} border-slate-700" placeholder={field.placeholder} />
						{/if}
					</div>
				{/each}
			</div>
		</details>

		<!-- Notes -->
		<div>
			<label for="notes" class="block text-sm font-medium text-slate-300 mb-1">Notes</label>
			<textarea id="notes" bind:value={form.notes} rows="2"
				class="{inputCls} border-slate-700"></textarea>
		</div>

		<!-- Submit -->
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
