<script lang="ts">
	import { goto } from '$app/navigation';
	import { CHECKLIST_OPTIONS } from '$lib/mixs/checklists';
	import { ENV_PACKAGES, ENVO_BIOMES, ENVO_FEATURES, ENVO_MATERIALS } from '$lib/mixs/controlled-vocab';
	import { CORE_FIELDS, PACKAGE_FIELDS, MEASUREMENT_FIELDS, LOGISTICS_FIELDS } from '$lib/mixs/fields';
	import { validateSample } from '$lib/mixs/validators';
	import type { EnvPackage, MixsChecklist } from '$lib/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let form = $state<Record<string, unknown>>({
		project_id: data.preselectedProjectId as string,
		mixs_checklist: 'MIMARKS-SU',
		env_package: 'water',
		samp_name: '',
		collection_date: '',
		lat_lon: '',
		geo_loc_name: '',
		env_broad_scale: '',
		env_local_scale: '',
		env_medium: ''
	});

	let saving = $state(false);
	let errorMsg = $state('');

	let validation = $derived(validateSample(form as any));
	let packageFields = $derived(PACKAGE_FIELDS[(form.env_package as EnvPackage) || 'water'] || []);

	async function submit() {
		if (!form.project_id) {
			errorMsg = 'Please select a project';
			return;
		}
		if (!validation.valid) {
			errorMsg = `Please fix ${validation.errors.length} validation error(s)`;
			return;
		}

		saving = true;
		errorMsg = '';

		const res = await fetch('/api/samples', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(form)
		});

		if (res.ok) {
			const sample = await res.json();
			goto(`/samples/${sample.id}`);
		} else {
			errorMsg = 'Failed to create sample';
			saving = false;
		}
	}

	function fieldError(name: string): string | undefined {
		return validation.errors.find((e) => e.field === name)?.message;
	}
</script>

<div class="max-w-3xl space-y-6">
	<div>
		<a href="/samples" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Samples</a>
		<h1 class="text-2xl font-bold text-white mt-1">New Sample</h1>
	</div>

	<!-- Completeness bar -->
	<div class="flex items-center gap-3">
		<div class="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
			<div
				class="h-full transition-all rounded-full {validation.completeness === 100 ? 'bg-green-500' : 'bg-ocean-500'}"
				style="width: {validation.completeness}%"
			></div>
		</div>
		<span class="text-sm text-slate-400">{validation.completeness}% complete</span>
	</div>

	{#if errorMsg}
		<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>
	{/if}

	<form onsubmit={(e) => { e.preventDefault(); submit(); }} class="space-y-8">
		<!-- Project & Checklist -->
		<fieldset class="space-y-4">
			<legend class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Classification</legend>

			<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
				<div>
					<label for="project_id" class="block text-sm font-medium text-slate-300 mb-1">Project *</label>
					<select
						id="project_id"
						bind:value={form.project_id}
						class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500"
					>
						<option value="">Select project...</option>
						{#each data.projects as project}
							<option value={project.id}>{project.project_name}</option>
						{/each}
					</select>
				</div>

				<div>
					<label for="mixs_checklist" class="block text-sm font-medium text-slate-300 mb-1">MIxS Checklist *</label>
					<select
						id="mixs_checklist"
						bind:value={form.mixs_checklist}
						class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500"
					>
						{#each CHECKLIST_OPTIONS as opt}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
					<p class="text-xs text-slate-500 mt-1">{CHECKLIST_OPTIONS.find(o => o.value === form.mixs_checklist)?.description}</p>
				</div>

				<div>
					<label for="env_package" class="block text-sm font-medium text-slate-300 mb-1">Env Package *</label>
					<select
						id="env_package"
						bind:value={form.env_package}
						class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500"
					>
						{#each ENV_PACKAGES as pkg}
							<option value={pkg.value}>{pkg.label}</option>
						{/each}
					</select>
				</div>
			</div>
		</fieldset>

		<!-- Core MIxS fields -->
		<fieldset class="space-y-4">
			<legend class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Core MIxS Fields</legend>

			<div>
				<label for="samp_name" class="block text-sm font-medium text-slate-300 mb-1">Sample Name *</label>
				<input
					id="samp_name"
					type="text"
					bind:value={form.samp_name}
					class="w-full px-3 py-2 bg-slate-800 border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500 {fieldError('samp_name') ? 'border-red-700' : 'border-slate-700'}"
					placeholder="e.g., eDNA_River_2026_001"
				/>
				{#if fieldError('samp_name')}<p class="text-xs text-red-400 mt-1">{fieldError('samp_name')}</p>{/if}
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label for="collection_date" class="block text-sm font-medium text-slate-300 mb-1">Collection Date *</label>
					<input
						id="collection_date"
						type="date"
						bind:value={form.collection_date}
						class="w-full px-3 py-2 bg-slate-800 border rounded-lg text-white focus:outline-none focus:border-ocean-500 {fieldError('collection_date') ? 'border-red-700' : 'border-slate-700'}"
					/>
					{#if fieldError('collection_date')}<p class="text-xs text-red-400 mt-1">{fieldError('collection_date')}</p>{/if}
				</div>

				<div>
					<label for="lat_lon" class="block text-sm font-medium text-slate-300 mb-1">Lat/Lon *</label>
					<input
						id="lat_lon"
						type="text"
						bind:value={form.lat_lon}
						class="w-full px-3 py-2 bg-slate-800 border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500 {fieldError('lat_lon') ? 'border-red-700' : 'border-slate-700'}"
						placeholder="45.5231 N 122.6765 W"
					/>
					{#if fieldError('lat_lon')}<p class="text-xs text-red-400 mt-1">{fieldError('lat_lon')}</p>{/if}
				</div>
			</div>

			<div>
				<label for="geo_loc_name" class="block text-sm font-medium text-slate-300 mb-1">Geographic Location *</label>
				<input
					id="geo_loc_name"
					type="text"
					bind:value={form.geo_loc_name}
					class="w-full px-3 py-2 bg-slate-800 border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500 {fieldError('geo_loc_name') ? 'border-red-700' : 'border-slate-700'}"
					placeholder="Canada: British Columbia"
				/>
				{#if fieldError('geo_loc_name')}<p class="text-xs text-red-400 mt-1">{fieldError('geo_loc_name')}</p>{/if}
			</div>

			<div>
				<label for="env_broad_scale" class="block text-sm font-medium text-slate-300 mb-1">Broad-scale Environment *</label>
				<input
					id="env_broad_scale"
					type="text"
					bind:value={form.env_broad_scale}
					list="biomes"
					class="w-full px-3 py-2 bg-slate-800 border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500 {fieldError('env_broad_scale') ? 'border-red-700' : 'border-slate-700'}"
					placeholder="marine biome [ENVO:00000447]"
				/>
				<datalist id="biomes">
					{#each ENVO_BIOMES as b}<option value="{b.label} [{b.id}]"></option>{/each}
				</datalist>
				{#if fieldError('env_broad_scale')}<p class="text-xs text-red-400 mt-1">{fieldError('env_broad_scale')}</p>{/if}
			</div>

			<div>
				<label for="env_local_scale" class="block text-sm font-medium text-slate-300 mb-1">Local Environment *</label>
				<input
					id="env_local_scale"
					type="text"
					bind:value={form.env_local_scale}
					list="features"
					class="w-full px-3 py-2 bg-slate-800 border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500 {fieldError('env_local_scale') ? 'border-red-700' : 'border-slate-700'}"
					placeholder="coastal water [ENVO:00002150]"
				/>
				<datalist id="features">
					{#each ENVO_FEATURES as f}<option value="{f.label} [{f.id}]"></option>{/each}
				</datalist>
				{#if fieldError('env_local_scale')}<p class="text-xs text-red-400 mt-1">{fieldError('env_local_scale')}</p>{/if}
			</div>

			<div>
				<label for="env_medium" class="block text-sm font-medium text-slate-300 mb-1">Environmental Medium *</label>
				<input
					id="env_medium"
					type="text"
					bind:value={form.env_medium}
					list="materials"
					class="w-full px-3 py-2 bg-slate-800 border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500 {fieldError('env_medium') ? 'border-red-700' : 'border-slate-700'}"
					placeholder="sea water [ENVO:00002149]"
				/>
				<datalist id="materials">
					{#each ENVO_MATERIALS as m}<option value="{m.label} [{m.id}]"></option>{/each}
				</datalist>
				{#if fieldError('env_medium')}<p class="text-xs text-red-400 mt-1">{fieldError('env_medium')}</p>{/if}
			</div>
		</fieldset>

		<!-- Package-specific fields -->
		{#if packageFields.length > 0}
			<fieldset class="space-y-4">
				<legend class="text-sm font-semibold text-slate-300 uppercase tracking-wider">{form.env_package} Package Fields</legend>
				{#each packageFields as field}
					<div>
						<label for={field.name} class="block text-sm font-medium text-slate-300 mb-1">
							{field.label} {field.required ? '*' : ''} {field.unit ? `(${field.unit})` : ''}
						</label>
						<input
							id={field.name}
							type="text"
							bind:value={form[field.name]}
							class="w-full px-3 py-2 bg-slate-800 border rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500 {fieldError(field.name) ? 'border-red-700' : 'border-slate-700'}"
							placeholder={field.placeholder}
						/>
						{#if fieldError(field.name)}<p class="text-xs text-red-400 mt-1">{fieldError(field.name)}</p>{/if}
					</div>
				{/each}
			</fieldset>
		{/if}

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
						<input
							id={field.name}
							type="number"
							step="any"
							bind:value={form[field.name]}
							class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500"
						/>
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
						{#if field.type === 'select' && field.options}
							<select
								id={field.name}
								bind:value={form[field.name]}
								class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500"
							>
								<option value="">Select...</option>
								{#each field.options as opt}
									<option value={opt.value}>{opt.label}</option>
								{/each}
							</select>
						{:else if field.type === 'number'}
							<input
								id={field.name}
								type="number"
								step="any"
								bind:value={form[field.name]}
								class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500"
								placeholder={field.placeholder}
							/>
						{:else}
							<input
								id={field.name}
								type="text"
								bind:value={form[field.name]}
								class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500"
								placeholder={field.placeholder}
							/>
						{/if}
					</div>
				{/each}
			</div>
		</details>

		<!-- Notes -->
		<div>
			<label for="notes" class="block text-sm font-medium text-slate-300 mb-1">Notes</label>
			<textarea
				id="notes"
				bind:value={form.notes}
				rows="2"
				class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500"
			></textarea>
		</div>

		<!-- Submit -->
		<div class="flex gap-3 pt-2">
			<button
				type="submit"
				disabled={saving}
				class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium"
			>
				{saving ? 'Creating...' : 'Create Sample'}
			</button>
			<a href="/samples" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">
				Cancel
			</a>
		</div>
	</form>
</div>
