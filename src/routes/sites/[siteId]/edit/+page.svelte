<script lang="ts">
	import { goto } from '$app/navigation';
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
		env_broad_scale: data.site.env_broad_scale || '',
		env_local_scale: data.site.env_local_scale || '',
		habitat_type: data.site.habitat_type || '',
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
		if (!form.project_id) { errorMsg = 'Please select a project'; return; }
		if (!(form.site_name as string).trim()) { errorMsg = 'Site name is required'; return; }
		if (latitude == null || longitude == null) {
			errorMsg = 'GPS coordinates are required — click the map or type lat/lng';
			return;
		}
		saving = true; errorMsg = '';

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
		<a href="/sites/{data.site.id}" class="text-sm text-slate-400 hover:text-ocean-400">&larr; {data.site.site_name}</a>
		<h1 class="text-2xl font-bold text-white mt-1">Edit Site</h1>
	</div>

	{#if errorMsg}<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>{/if}

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
				<input id="description" type="text" bind:value={form.description} class={inputCls} placeholder="Brief description of this sampling site" />
			</div>
		</fieldset>

		<fieldset class="space-y-4">
			<legend class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Location</legend>
			<p class="text-xs text-slate-500">Click the map to set coordinates, or enter them manually.</p>
			<MapPicker bind:latitude bind:longitude onchange={onMapClick} height="350px" />
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label for="latitude" class="block text-sm font-medium text-slate-300 mb-1">Latitude</label>
					<input id="latitude" type="number" step="any" bind:value={latitude} class={inputCls} placeholder="e.g., 48.4284" />
				</div>
				<div>
					<label for="longitude" class="block text-sm font-medium text-slate-300 mb-1">Longitude</label>
					<input id="longitude" type="number" step="any" bind:value={longitude} class={inputCls} placeholder="e.g., -123.3656" />
				</div>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<label for="geo_loc_name" class="block text-sm font-medium text-slate-300 mb-1">
						<a href="/settings?tab=category" target="_blank" class="hover:text-ocean-400">Geographic Location</a>
					</label>
					<select id="geo_loc_name" bind:value={form.geo_loc_name} class={selectCls}>
						<option value="">Select...</option>
						{#each data.picklists.geo_loc_name as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select>
				</div>
				<div>
					<label for="locality" class="block text-sm font-medium text-slate-300 mb-1">
						<a href="/settings?tab=category" target="_blank" class="hover:text-ocean-400">Locality</a>
					</label>
					<select id="locality" bind:value={form.locality} class={selectCls}>
						<option value="">Select...</option>
						{#each data.picklists.locality as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select>
				</div>
			</div>
			<div>
				<label for="habitat_type" class="block text-sm font-medium text-slate-300 mb-1">
					<a href="/settings?tab=category" target="_blank" class="hover:text-ocean-400">Habitat Type</a>
				</label>
				<select id="habitat_type" bind:value={form.habitat_type} class={selectCls}>
					<option value="">Select...</option>
					{#each data.picklists.habitat_type as opt}
						<option value={opt.value}>{opt.label}</option>
					{/each}
				</select>
			</div>
		</fieldset>

		<fieldset class="space-y-4">
			<legend class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Environment</legend>
			<div>
				<label for="env_broad_scale" class="block text-sm font-medium text-slate-300 mb-1">
					<a href="/settings?tab=category" target="_blank" class="hover:text-ocean-400">Broad-scale Environment</a>
				</label>
				<select id="env_broad_scale" bind:value={form.env_broad_scale} class={selectCls}>
					<option value="">Select...</option>
					{#each data.picklists.env_broad_scale as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
			</div>
			<div>
				<label for="env_local_scale" class="block text-sm font-medium text-slate-300 mb-1">
					<a href="/settings?tab=category" target="_blank" class="hover:text-ocean-400">Local Environment</a>
				</label>
				<select id="env_local_scale" bind:value={form.env_local_scale} class={selectCls}>
					<option value="">Select...</option>
					{#each data.picklists.env_local_scale as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
			</div>
		</fieldset>

		<div>
			<label for="access_notes" class="block text-sm font-medium text-slate-300 mb-1">Access Notes</label>
			<textarea id="access_notes" bind:value={form.access_notes} rows="2" class={inputCls} placeholder="Boat access only, permit required, etc."></textarea>
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
