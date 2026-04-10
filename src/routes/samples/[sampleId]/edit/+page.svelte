<script lang="ts">
	import { goto } from '$app/navigation';
	import { CHECKLIST_OPTIONS } from '$lib/mixs/checklists';
	import { ENV_PACKAGES, ENVO_BIOMES, ENVO_FEATURES, ENVO_MATERIALS } from '$lib/mixs/controlled-vocab';
	import { formatLatLon } from '$lib/mixs/validators';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let latitude = $state<number | null>(data.sample.latitude ?? null);
	let longitude = $state<number | null>(data.sample.longitude ?? null);

	let form = $state<Record<string, unknown>>({
		project_id: data.sample.project_id || '',
		site_id: data.sample.site_id || '',
		mixs_checklist: data.sample.mixs_checklist || 'MIMARKS-SU',
		env_package: data.sample.env_package || '',
		samp_name: data.sample.samp_name || '',
		collection_date: data.sample.collection_date || '',
		geo_loc_name: data.sample.geo_loc_name || '',
		env_broad_scale: data.sample.env_broad_scale || '',
		env_local_scale: data.sample.env_local_scale || '',
		env_medium: data.sample.env_medium || '',
		notes: data.sample.notes || ''
	});

	let availableSites = $derived(
		(data.sites as any[]).filter((s: any) => !form.project_id || s.project_id === form.project_id)
	);

	let saving = $state(false);
	let errorMsg = $state('');

	async function submit() {
		saving = true;
		errorMsg = '';

		const body = {
			...form,
			site_id: form.site_id || null,
			lat_lon: latitude != null && longitude != null ? formatLatLon(latitude, longitude) : null
		};
		const res = await fetch(`/api/samples/${data.sample.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (res.ok) {
			goto(`/samples/${data.sample.id}`);
		} else {
			errorMsg = (await res.json().catch(() => ({}))).error || 'Failed to update sample';
			saving = false;
		}
	}

	const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';
	const selectCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500';
</script>

<div class="max-w-3xl space-y-6">
	<div>
		<a href="/samples" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Samples</a>
		<h1 class="text-2xl font-bold text-white mt-1">Edit {data.sample.samp_name}</h1>
	</div>

	{#if errorMsg}
		<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>
	{/if}

	<form onsubmit={(e) => { e.preventDefault(); submit(); }} class="space-y-6">
		<fieldset class="space-y-4">
			<legend class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Classification</legend>
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
					<select id="site_id" bind:value={form.site_id} class={selectCls}>
						<option value="">No site / manual entry</option>
						{#each availableSites as site}
							<option value={site.id}>{site.site_name}</option>
						{/each}
					</select>
				</div>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label for="mixs_checklist" class="block text-sm font-medium text-slate-300 mb-1">MIxS Checklist</label>
					<select id="mixs_checklist" bind:value={form.mixs_checklist} class={selectCls}>
						{#each CHECKLIST_OPTIONS as opt}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="env_package" class="block text-sm font-medium text-slate-300 mb-1">Env Package</label>
					<select id="env_package" bind:value={form.env_package} class={selectCls}>
						<option value="">Select...</option>
						{#each ENV_PACKAGES as pkg}
							<option value={pkg.value}>{pkg.label}</option>
						{/each}
					</select>
				</div>
			</div>
		</fieldset>

		<fieldset class="space-y-4">
			<legend class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Core Fields</legend>
			<div>
				<label for="samp_name" class="block text-sm font-medium text-slate-300 mb-1">Sample Name</label>
				<input id="samp_name" type="text" bind:value={form.samp_name} class={inputCls} />
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
				<div>
					<label for="collection_date" class="block text-sm font-medium text-slate-300 mb-1">Collection Date</label>
					<input id="collection_date" type="date" bind:value={form.collection_date} class={inputCls} />
				</div>
				<div>
					<label for="latitude" class="block text-sm font-medium text-slate-300 mb-1">Latitude</label>
					<input id="latitude" type="number" step="any" bind:value={latitude} class={inputCls} />
				</div>
				<div>
					<label for="longitude" class="block text-sm font-medium text-slate-300 mb-1">Longitude</label>
					<input id="longitude" type="number" step="any" bind:value={longitude} class={inputCls} />
				</div>
			</div>
			<div>
				<label for="geo_loc_name" class="block text-sm font-medium text-slate-300 mb-1">Geographic Location</label>
				<input id="geo_loc_name" type="text" bind:value={form.geo_loc_name} class={inputCls} />
			</div>
			<div>
				<label for="env_broad_scale" class="block text-sm font-medium text-slate-300 mb-1">Broad-scale Environment</label>
				<input id="env_broad_scale" type="text" bind:value={form.env_broad_scale} list="biomes" class={inputCls} />
				<datalist id="biomes">
					{#each ENVO_BIOMES as b}<option value="{b.label} [{b.id}]"></option>{/each}
				</datalist>
			</div>
			<div>
				<label for="env_local_scale" class="block text-sm font-medium text-slate-300 mb-1">Local Environment</label>
				<input id="env_local_scale" type="text" bind:value={form.env_local_scale} list="features" class={inputCls} />
				<datalist id="features">
					{#each ENVO_FEATURES as f}<option value="{f.label} [{f.id}]"></option>{/each}
				</datalist>
			</div>
			<div>
				<label for="env_medium" class="block text-sm font-medium text-slate-300 mb-1">Environmental Medium</label>
				<input id="env_medium" type="text" bind:value={form.env_medium} list="materials" class={inputCls} />
				<datalist id="materials">
					{#each ENVO_MATERIALS as m}<option value="{m.label} [{m.id}]"></option>{/each}
				</datalist>
			</div>
		</fieldset>

		<div>
			<label for="notes" class="block text-sm font-medium text-slate-300 mb-1">Notes</label>
			<textarea id="notes" bind:value={form.notes} rows="2" class={inputCls}></textarea>
		</div>

		<div class="flex gap-3 pt-2">
			<button type="submit" disabled={saving} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">
				{saving ? 'Saving...' : 'Save'}
			</button>
			<a href="/samples/{data.sample.id}" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</a>
		</div>
	</form>
</div>
