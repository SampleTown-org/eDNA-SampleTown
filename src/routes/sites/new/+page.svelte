<script lang="ts">
	import { goto } from '$app/navigation';
	import { formatLatLon } from '$lib/mixs/validators';
	import MapPicker from '$lib/components/MapPicker.svelte';
	import FieldLabel from '$lib/components/FieldLabel.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let latitude = $state<number | null>(null);
	let longitude = $state<number | null>(null);

	let form = $state<Record<string, unknown>>({
		project_id: data.preselectedProjectId as string,
		site_name: '',
		site_code: '',
		description: '',
		geo_loc_name: '',
		locality: '',
		env_broad_scale: '',
		env_local_scale: '',
		access_notes: '',
		notes: ''
	});

	function onMapClick(lat: number, lng: number) {
		latitude = lat;
		longitude = lng;
	}

	let saving = $state(false);
	let errorMsg = $state('');

	// Photos are staged client-side and uploaded after the site is created.
	let stagedPhotos = $state<File[]>([]);
	let photoInput: HTMLInputElement | undefined;

	function addPhotos(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		stagedPhotos = [...stagedPhotos, ...files];
		if (photoInput) photoInput.value = '';
	}

	function removeStaged(i: number) {
		stagedPhotos = stagedPhotos.filter((_, idx) => idx !== i);
	}

	async function submit() {
		if (!form.project_id) { errorMsg = 'Please select a project'; return; }
		if (!(form.site_name as string).trim()) { errorMsg = 'Site name is required'; return; }
		if (latitude == null || longitude == null) {
			errorMsg = 'GPS coordinates are required — click the map or type lat/lng';
			return;
		}
		saving = true; errorMsg = '';

		const body = {
			...(data.scannedId ? { id: data.scannedId } : {}),
			...form,
			lat_lon: latitude != null && longitude != null ? formatLatLon(latitude, longitude) : null,
			latitude,
			longitude
		};
		const res = await fetch('/api/sites', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) {
			errorMsg = (await res.json().catch(() => ({}))).error || 'Failed to create site';
			saving = false;
			return;
		}
		const site = await res.json();
		// Best-effort photo upload; failures are reported but don't undo the
		// site creation — user can retry from the detail page.
		const failed: string[] = [];
		for (const file of stagedPhotos) {
			const fd = new FormData();
			fd.append('file', file);
			const up = await fetch(`/api/sites/${site.id}/photos`, { method: 'POST', body: fd });
			if (!up.ok) failed.push(file.name);
		}
		if (failed.length > 0) {
			errorMsg = `Site saved, but these photos failed: ${failed.join(', ')}`;
			saving = false;
			return;
		}
		goto(`/sites/${site.id}`);
	}

	function formatBytes(n: number): string {
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
		return `${(n / 1024 / 1024).toFixed(1)} MB`;
	}

	const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';
	const selectCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500';
</script>

<div class="max-w-3xl space-y-6">
	<div>
		<a href="/sites" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Sites</a>
		<h1 class="text-2xl font-bold text-white mt-1">{data.lab?.name ? data.lab.name + " " : ""}New Site</h1>
	</div>

	<form onsubmit={(e) => { e.preventDefault(); submit(); }} class="space-y-6">
		<fieldset class="space-y-4">
			<legend class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Identification</legend>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<FieldLabel slot="project" for="project_id" label="Project" description="SampleTown project this site belongs to." />
					<select id="project_id" bind:value={form.project_id} class={selectCls}>
						<option value="">Select project...</option>
						{#each data.projects as project}
							<option value={project.id}>{project.project_name}</option>
						{/each}
					</select>
				</div>
				<div>
					<FieldLabel slot="site_name" for="site_name" label="Site Name" description="Human-readable name for this sampling site. Unique within the project. Spaces + punctuation allowed." />
					<input id="site_name" type="text" bind:value={form.site_name} class={inputCls} placeholder={data.namingTemplates?.site_name || 'e.g., Churchill Drive / Manitoba Canoe & Kayak Center'} />
				</div>
			</div>
			<div>
				<FieldLabel slot="site_code" for="site_code" label="Site Code (optional)" description="Short machine-friendly identifier — letters, digits, and _.- only (e.g., CHDR, WRLB). Unique per project when set." />
				<input id="site_code" type="text" bind:value={form.site_code} class={inputCls} placeholder="e.g., CHDR" pattern="[a-zA-Z0-9_.\-]+" />
			</div>
			<div>
				<FieldLabel slot="description" label="Description" description="Brief description of this sampling site (free text)." />
				<input id="description" type="text" bind:value={form.description} class={inputCls} placeholder="Brief description of this sampling site" />
			</div>
		</fieldset>

		<fieldset class="space-y-4">
			<legend class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Location</legend>
			<p class="text-xs text-slate-500">Click the map to set coordinates, or enter them manually.</p>
			<MapPicker bind:latitude bind:longitude onchange={onMapClick} height="350px" />
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<FieldLabel slot="lat_lon" for="latitude" label="Latitude" description="Decimal degrees, positive north of the equator. Exported as part of the MIxS lat_lon slot." />
					<input id="latitude" type="number" step="any" bind:value={latitude} class={inputCls} placeholder="e.g., 48.4284" />
				</div>
				<div>
					<FieldLabel slot="lat_lon" for="longitude" label="Longitude" description="Decimal degrees, positive east of the prime meridian. Exported as part of the MIxS lat_lon slot." />
					<input id="longitude" type="number" step="any" bind:value={longitude} class={inputCls} placeholder="e.g., -123.3656" />
				</div>
			</div>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<div>
					<FieldLabel slot="geo_loc_name" picklistCategory="geo_loc_name" />
					<select id="geo_loc_name" bind:value={form.geo_loc_name} class={selectCls}>
						<option value="">Select...</option>
						{#each data.picklists.geo_loc_name as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select>
				</div>
				<div>
					<FieldLabel slot="locality" for="locality" label="Locality" picklistCategory="locality" description="Finer-grained locality name within the geographic location (SampleTown-local; not a MIxS slot)." />
					<select id="locality" bind:value={form.locality} class={selectCls}>
						<option value="">Select...</option>
						{#each data.picklists.locality as opt}<option value={opt.value}>{opt.label}</option>{/each}
					</select>
				</div>
			</div>
		</fieldset>

		<fieldset class="space-y-4">
			<legend class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Environment</legend>
			<div>
				<FieldLabel slot="env_broad_scale" picklistCategory="env_broad_scale" />
				<select id="env_broad_scale" bind:value={form.env_broad_scale} class={selectCls}>
					<option value="">Select...</option>
					{#each data.picklists.env_broad_scale as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
			</div>
			<div>
				<FieldLabel slot="env_local_scale" picklistCategory="env_local_scale" />
				<select id="env_local_scale" bind:value={form.env_local_scale} class={selectCls}>
					<option value="">Select...</option>
					{#each data.picklists.env_local_scale as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
			</div>
		</fieldset>

		<div>
			<FieldLabel slot="access_notes" label="Access Notes" description="How to get to this site: boat access only, permit required, trail conditions, etc. (SampleTown-local note.)" />
			<textarea id="access_notes" bind:value={form.access_notes} rows="2" class={inputCls} placeholder="Boat access only, permit required, etc."></textarea>
		</div>

		<div>
			<FieldLabel slot="notes" label="Notes" description="Free-form notes about this site." />
			<textarea id="notes" bind:value={form.notes} rows="2" class={inputCls}></textarea>
		</div>

		<fieldset class="space-y-3">
			<legend class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Photos</legend>
			<p class="text-xs text-slate-500">Optional. Photos upload after the site is saved. JPEG, PNG, WebP, or GIF up to 15 MB each.</p>
			<label class="inline-block px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm cursor-pointer">
				Add Photos
				<input
					bind:this={photoInput}
					type="file"
					accept="image/jpeg,image/png,image/webp,image/gif"
					multiple
					onchange={addPhotos}
					class="hidden"
				/>
			</label>
			{#if stagedPhotos.length > 0}
				<ul class="space-y-1 text-sm">
					{#each stagedPhotos as file, i}
						<li class="flex items-center justify-between px-3 py-1.5 rounded bg-slate-900/50 border border-slate-800">
							<span class="text-slate-300 truncate">{file.name}</span>
							<span class="flex items-center gap-3 text-xs text-slate-500">
								<span>{formatBytes(file.size)}</span>
								<button type="button" onclick={() => removeStaged(i)} class="text-slate-500 hover:text-red-400" title="Remove">✕</button>
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</fieldset>

		{#if errorMsg}<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>{/if}
		<div class="flex gap-3 pt-2">
			<button type="submit" disabled={saving} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">
				{saving ? 'Creating...' : 'Create Site'}
			</button>
			<a href="/sites" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</a>
		</div>
	</form>
</div>
