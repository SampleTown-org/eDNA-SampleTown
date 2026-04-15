<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import DataTable from '$lib/components/DataTable.svelte';
	import MapPicker from '$lib/components/MapPicker.svelte';
	import GlossaryDoc from '$lib/components/GlossaryDoc.svelte';
	import EntityQR from '$lib/components/EntityQR.svelte';
	import Breadcrumb from '$lib/components/Breadcrumb.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const site = data.site as any;
	const crumbs = $derived([
		{ label: data.lab?.name ?? 'Lab', href: '/' },
		{ label: 'Projects', href: '/projects' },
		{ label: site.project_name, href: `/projects/${site.project_id}` },
		{ label: 'Sites', href: '/sites' },
		{ label: site.site_name }
	]);
	const photos = $derived(data.photos as Array<{
		id: string;
		filename: string;
		original_filename: string | null;
		mime_type: string;
		size_bytes: number;
		caption: string | null;
		created_at: string;
	}>);

	// ----- Photo gallery -----
	let uploading = $state(false);
	let uploadError = $state<string | null>(null);
	let fileInput: HTMLInputElement | undefined;
	let lightboxPhoto = $state<{ id: string; caption: string | null; original_filename: string | null } | null>(null);

	async function handleUpload(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		if (files.length === 0) return;
		uploadError = null;
		uploading = true;
		try {
			const failures: string[] = [];
			for (const file of files) {
				const fd = new FormData();
				fd.append('file', file);
				const res = await fetch(`/api/sites/${site.id}/photos`, { method: 'POST', body: fd });
				if (!res.ok) {
					const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
					failures.push(`${file.name}: ${body.error ?? 'Upload failed'}`);
				}
			}
			if (failures.length > 0) uploadError = failures.join('\n');
			await invalidateAll();
		} finally {
			uploading = false;
			if (fileInput) fileInput.value = '';
		}
	}

	async function deletePhoto(photoId: string) {
		if (!confirm('Delete this photo? This cannot be undone.')) return;
		const res = await fetch(`/api/sites/${site.id}/photos/${photoId}`, { method: 'DELETE' });
		if (!res.ok) {
			const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
			alert(body.error ?? 'Delete failed');
			return;
		}
		if (lightboxPhoto?.id === photoId) lightboxPhoto = null;
		await invalidateAll();
	}

	function formatBytes(n: number): string {
		if (n < 1024) return `${n} B`;
		if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
		return `${(n / 1024 / 1024).toFixed(1)} MB`;
	}

	const locationFields: [string, unknown, string?][] = ([
		['Lat/Lon', data.site.lat_lon, 'lat_lon'],
		['Geographic Location', data.site.geo_loc_name, 'geo_loc_name'],
		['Locality', data.site.locality]
	] as [string, unknown, string?][]).filter(([_, v]) => v);

	const envFields: [string, unknown, string?][] = ([
		['Broad-scale Env', data.site.env_broad_scale, 'env_broad_scale'],
		['Local Env', data.site.env_local_scale, 'env_local_scale']
	] as [string, unknown, string?][]).filter(([_, v]) => v);

	const sampleColumns = [
		{ key: 'samp_name', label: 'Sample', sortable: true },
		{ key: 'mixs_checklist', label: 'Checklist', sortable: true },
		{ key: 'collection_date', label: 'Collected', sortable: true },
		{ key: 'collector_name', label: 'Collector', sortable: true }
	];
</script>

<div class="space-y-6">
	<div>
		<Breadcrumb items={crumbs} />
		<div class="flex items-start justify-between mt-1 gap-4">
			<div class="flex items-center gap-3">
				<h1 class="text-2xl font-bold text-white">{data.site.site_name}</h1>
			</div>
			<div class="flex items-center gap-3 shrink-0">
				<EntityQR id={data.site.id} size={96} />
				<a href="/sites/{data.site.id}/edit" class="hidden sm:inline-flex write-only px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Edit</a>
			</div>
		</div>
		<p class="text-slate-400 mt-1">
			Project: <a href="/projects/{data.site.project_id}" class="text-ocean-400 hover:text-ocean-300">{data.site.project_name}</a>
		</p>
		{#if data.site.description}
			<p class="text-slate-300 mt-2 text-sm">{data.site.description}</p>
		{/if}
	</div>

	{#if data.site.latitude != null && data.site.longitude != null}
		<MapPicker latitude={data.site.latitude} longitude={data.site.longitude} readonly height="250px" />
	{/if}

	{#if locationFields.length > 0}
	<div class="rounded-lg border border-slate-800 p-5 space-y-3">
		<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Location</h2>
		<dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
			{#each locationFields as [label, value, slot]}
				<div class="flex justify-between py-1 border-b border-slate-800/50">
					<dt class="text-slate-400">
						{#if slot}<GlossaryDoc {slot} {label} />{:else}{label}{/if}
					</dt>
					<dd class="text-slate-200">{value}</dd>
				</div>
			{/each}
		</dl>
	</div>
	{/if}

	{#if envFields.length > 0}
	<div class="rounded-lg border border-slate-800 p-5 space-y-3">
		<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Environment</h2>
		<dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
			{#each envFields as [label, value, slot]}
				<div class="flex justify-between py-1 border-b border-slate-800/50">
					<dt class="text-slate-400">
						{#if slot}<GlossaryDoc {slot} {label} />{:else}{label}{/if}
					</dt>
					<dd class="text-slate-200">{value}</dd>
				</div>
			{/each}
		</dl>
	</div>
	{/if}

	{#if data.site.access_notes}
	<div class="rounded-lg border border-slate-800 p-5">
		<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-2">Access Notes</h2>
		<p class="text-sm text-slate-300">{data.site.access_notes}</p>
	</div>
	{/if}

	{#if data.site.notes}
	<div class="rounded-lg border border-slate-800 p-5">
		<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-2">Notes</h2>
		<p class="text-sm text-slate-300">{data.site.notes}</p>
	</div>
	{/if}

	<!-- Photos -->
	<div>
		<div class="flex items-center justify-between mb-3">
			<h2 class="text-lg font-semibold text-white">Photos ({photos.length})</h2>
			<label class="hidden sm:inline-flex write-only px-3 py-1.5 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium cursor-pointer {uploading ? 'opacity-50 pointer-events-none' : ''}">
				{uploading ? 'Uploading…' : 'Add Photos'}
				<input
					bind:this={fileInput}
					type="file"
					accept="image/jpeg,image/png,image/webp,image/gif"
					multiple
					onchange={handleUpload}
					class="hidden"
					disabled={uploading}
				/>
			</label>
		</div>
		{#if uploadError}
			<div class="mb-3 px-3 py-2 rounded border border-red-900 bg-red-950/40 text-sm text-red-300 whitespace-pre-line">{uploadError}</div>
		{/if}
		{#if photos.length === 0}
			<div class="rounded-lg border border-dashed border-slate-800 p-8 text-center text-sm text-slate-500">
				No photos yet. Add one with the button above.
			</div>
		{:else}
			<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
				{#each photos as photo}
					<div class="group relative aspect-square rounded-lg overflow-hidden border border-slate-800 bg-slate-900">
						<button
							type="button"
							onclick={() => (lightboxPhoto = { id: photo.id, caption: photo.caption, original_filename: photo.original_filename })}
							class="block w-full h-full"
							title={photo.caption ?? photo.original_filename ?? ''}
						>
							<img
								src="/api/sites/{site.id}/photos/{photo.id}"
								alt={photo.caption ?? photo.original_filename ?? 'Site photo'}
								loading="lazy"
								class="w-full h-full object-cover"
							/>
						</button>
						<button
							type="button"
							onclick={() => deletePhoto(photo.id)}
							class="absolute top-1 right-1 px-2 py-1 rounded bg-slate-900/80 text-xs text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-red-900/80 hover:text-white transition-all"
							title="Delete photo"
						>✕</button>
						{#if photo.caption}
							<div class="absolute inset-x-0 bottom-0 px-2 py-1 bg-gradient-to-t from-slate-950/90 to-transparent text-xs text-slate-200 truncate">{photo.caption}</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>

	{#if lightboxPhoto}
		<div
			class="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-4"
			onclick={() => (lightboxPhoto = null)}
			onkeydown={(e) => { if (e.key === 'Escape') lightboxPhoto = null; }}
			role="dialog"
			aria-modal="true"
			aria-label="Photo viewer"
			tabindex="-1"
		>
			<div class="max-h-full max-w-full flex flex-col items-center gap-2" onclick={(e) => e.stopPropagation()} role="presentation">
				<img
					src="/api/sites/{site.id}/photos/{lightboxPhoto.id}"
					alt={lightboxPhoto.caption ?? lightboxPhoto.original_filename ?? 'Site photo'}
					class="max-h-[85vh] max-w-[90vw] object-contain rounded"
				/>
				<div class="flex items-center gap-4 text-sm text-slate-300">
					{#if lightboxPhoto.caption}<span>{lightboxPhoto.caption}</span>{:else if lightboxPhoto.original_filename}<span class="text-slate-500">{lightboxPhoto.original_filename}</span>{/if}
					<a
						href="/api/sites/{site.id}/photos/{lightboxPhoto.id}"
						target="_blank"
						rel="noopener"
						class="text-ocean-400 hover:text-ocean-300"
					>Open full size &rarr;</a>
					<button
						type="button"
						onclick={() => (lightboxPhoto = null)}
						class="text-slate-400 hover:text-white"
					>Close</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Samples at this site -->
	<div>
		<div class="flex items-center justify-between mb-3">
			<h2 class="text-lg font-semibold text-white">Samples ({data.samples.length})</h2>
			<a
				href="/samples/new?site_id={data.site.id}&project_id={data.site.project_id}"
				class="hidden sm:inline-flex write-only px-3 py-1.5 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium"
			>
				Add Sample
			</a>
		</div>
		<DataTable
			columns={sampleColumns}
			rows={data.samples}
			href={(row) => `/samples/${row.id}`}
			empty="No samples at this site yet."
		/>
	</div>

</div>
