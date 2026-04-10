<script lang="ts">
	import { goto } from '$app/navigation';
	import { ENV_PACKAGES, ENVO_BIOMES, ENVO_FEATURES, ENVO_MATERIALS } from '$lib/mixs/controlled-vocab';
	import { formatLatLon } from '$lib/mixs/validators';
	import MapPicker from '$lib/components/MapPicker.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let latitude = $state<number | null>(data.site.latitude ?? null);
	let longitude = $state<number | null>(data.site.longitude ?? null);

	let form = $state<Record<string, unknown>>({
		project_id: data.site.project_id || '',
		site_name: data.site.site_name || '',
		description: data.site.description || '',
		geo_loc_name: data.site.geo_loc_name || '',
		locality: data.site.locality || '',
		habitat_type: data.site.habitat_type || '',
		env_package: data.site.env_package || '',
		depth: data.site.depth || '',
		elevation: data.site.elevation || '',
		env_broad_scale: data.site.env_broad_scale || '',
		env_local_scale: data.site.env_local_scale || '',
		env_medium: data.site.env_medium || '',
		access_notes: data.site.access_notes || '',
		notes: data.site.notes || ''
	});

	function onMapClick(lat: number, lng: number) {
		latitude = lat;
		longitude = lng;
	}

	let saving = $state(false);
	let errorMsg = $state('');

	async function submit() {
		saving = true;
		errorMsg = '';

		const body = {
			...form,
			lat_lon: latitude != null && longitude != null ? formatLatLon(latitude, longitude) : null,
			latitude,
			longitude
		};
		const res = await fetch(`/api/sites/${data.site.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (res.ok) {
			goto(`/sites/${data.site.id}`);
		} else {
			errorMsg = (await res.json().catch(() => ({}))).error || 'Failed to update site';
			saving = false;
		}
	}

	const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';
	const selectCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500';
</script>

<div class="max-w-3xl space-y-6">
	<div>
		<a href="/sites" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Sites</a>
		<h1 class="text-2xl font-bold text-white mt-1">Edit {data.site.site_name}</h1>
	</div>

	{#if errorMsg}
		<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>
	{/if}

	<form onsubmit={(e) => { e.preventDefault(); submit(); }} class="space-y-6">
		<fieldset class="space-y-4">
			<legend class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Identification</legend>
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
					<label for="site_name" class="block text-sm font-medium text-slate-300 mb-1">Site Name</label>
					<input id="site_name" type="text" bind:value={form.site_name} class={inputCls} />
				</div>
			</div>
			<div>
				<label for="description" class="block text-sm font-medium text-slate-300 mb-1">Description</label>
				<input id="description" type="text" bind:value={form.description} class={inputCls} />
			</div>
		</fieldset>

		<fieldset class="space-y-4">
			<legend class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Location</legend>
			<p class="text-xs text-slate-500">Click the map to set coordinates, or enter them manually.</p>
			<MapPicker bind:latitude bind:longitude onchange={onMapClick} height="350px" />
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label for="latitude" class="block text-sm font-medium text-slate-300 mb-1">Latitude</label>
					<input id="latitude" type="number" step="any" bind:value={latitude} class={inputCls} />
				</div>
				<div>
					<label for="longitude" class="block text-sm font-medium text-slate-300 mb-1">Longitude</label>
					<input id="longitude" type="number" step="any" bind:value={longitude} class={inputCls} />
				</div>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label for="geo_loc_name" class="block text-sm font-medium text-slate-300 mb-1">Geographic Location</label>
					<input id="geo_loc_name" type="text" bind:value={form.geo_loc_name} class={inputCls} />
				</div>
				<div>
					<label for="locality" class="block text-sm font-medium text-slate-300 mb-1">Locality</label>
					<input id="locality" type="text" bind:value={form.locality} class={inputCls} />
				</div>
			</div>
			<div>
				<label for="habitat_type" class="block text-sm font-medium text-slate-300 mb-1">Habitat Type</label>
				<input id="habitat_type" type="text" bind:value={form.habitat_type} class={inputCls} />
			</div>
		</fieldset>

		<fieldset class="space-y-4">
			<legend class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Environment</legend>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label for="env_package" class="block text-sm font-medium text-slate-300 mb-1">Env Package</label>
					<select id="env_package" bind:value={form.env_package} class={selectCls}>
						<option value="">Select...</option>
						{#each ENV_PACKAGES as pkg}
							<option value={pkg.value}>{pkg.label}</option>
						{/each}
					</select>
				</div>
				<div>
					<label for="depth" class="block text-sm font-medium text-slate-300 mb-1">Depth</label>
					<input id="depth" type="text" bind:value={form.depth} class={inputCls} />
				</div>
			</div>
			<div>
				<label for="elevation" class="block text-sm font-medium text-slate-300 mb-1">Elevation</label>
				<input id="elevation" type="text" bind:value={form.elevation} class={inputCls} />
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
			<label for="access_notes" class="block text-sm font-medium text-slate-300 mb-1">Access Notes</label>
			<textarea id="access_notes" bind:value={form.access_notes} rows="2" class={inputCls}></textarea>
		</div>

		<div>
			<label for="notes" class="block text-sm font-medium text-slate-300 mb-1">Notes</label>
			<textarea id="notes" bind:value={form.notes} rows="2" class={inputCls}></textarea>
		</div>

		<div class="flex gap-3 pt-2">
			<button type="submit" disabled={saving} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">
				{saving ? 'Saving...' : 'Save'}
			</button>
			<a href="/sites/{data.site.id}" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</a>
		</div>
	</form>
</div>
