<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import DataTable from '$lib/components/DataTable.svelte';
	import PeopleRoster from '$lib/components/PeopleRoster.svelte';
	import GlossaryDoc from '$lib/components/GlossaryDoc.svelte';
	import { getSlot } from '$lib/mixs/schema-index';
	import { slotTable } from '$lib/mixs/slot-ownership';
	import { MISC_PARAM_PREFIX } from '$lib/mixs/sample-form';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const sample = data.sample as Record<string, unknown>;
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
			for (const file of files) {
				const fd = new FormData();
				fd.append('file', file);
				const res = await fetch(`/api/samples/${sample.id}/photos`, { method: 'POST', body: fd });
				if (!res.ok) {
					const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
					uploadError = `${file.name}: ${body.error ?? 'Upload failed'}`;
					break;
				}
			}
			await invalidateAll();
		} finally {
			uploading = false;
			if (fileInput) fileInput.value = '';
		}
	}

	async function deletePhoto(photoId: string) {
		if (!confirm('Delete this photo? This cannot be undone.')) return;
		const res = await fetch(`/api/samples/${sample.id}/photos/${photoId}`, { method: 'DELETE' });
		if (!res.ok) {
			const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
			alert(body.error ?? 'Delete failed');
			return;
		}
		if (lightboxPhoto?.id === photoId) lightboxPhoto = null;
		await invalidateAll();
	}

	const extractColumns = [
		{ key: 'extract_name', label: 'Extract', sortable: true },
		{ key: 'extraction_method', label: 'Method', sortable: true },
		{ key: 'concentration_ng_ul', label: 'Conc. (ng/µL)', sortable: true },
		{ key: 'extraction_date', label: 'Date', sortable: true }
	];

	/** SampleTown columns that hold direct sample-stage data. We render every
	 *  one that has a value, so empty slots don't clutter the page. */
	const SAMPLE_COLUMNS: { key: string; label?: string; unit?: string }[] = [
		{ key: 'env_medium' },
		{ key: 'depth', unit: 'm' },
		{ key: 'elev', unit: 'm' },
		{ key: 'host_taxid' },
		{ key: 'specific_host' },
		{ key: 'temp', unit: '°C' },
		{ key: 'salinity', unit: 'PSU' },
		{ key: 'ph' },
		{ key: 'diss_oxygen', unit: 'mg/L' },
		{ key: 'pressure', unit: 'atm' },
		{ key: 'turbidity', unit: 'NTU' },
		{ key: 'chlorophyll', unit: 'µg/L' },
		{ key: 'nitrate', unit: 'µmol/L' },
		{ key: 'phosphate', unit: 'µmol/L' },
		{ key: 'samp_collect_device' },
		{ key: 'samp_collect_method' },
		{ key: 'samp_mat_process' },
		{ key: 'samp_size' },
		{ key: 'size_frac' },
		{ key: 'source_mat_id' },
		{ key: 'samp_store_sol' },
		{ key: 'samp_store_temp', unit: '°C' },
		{ key: 'samp_store_dur' },
		{ key: 'samp_store_loc' },
		{ key: 'store_cond' },
		{ key: 'ref_biomaterial' },
		{ key: 'isol_growth_condt' },
		{ key: 'tax_ident' },
		{ key: 'filter_type' },
		{ key: 'collector_name' }
	];

	/** Site-inherited fields. These live on sites; SampleTown emits them on
	 *  MIxS export from the joined site row. */
	const SITE_INHERITED: { key: string; label?: string }[] = [
		{ key: 'lat_lon' },
		{ key: 'geo_loc_name' },
		{ key: 'env_broad_scale' },
		{ key: 'env_local_scale' }
	];

	function val(key: string): unknown { return sample[key]; }
	function present(v: unknown): boolean { return v != null && v !== ''; }
	function slotTitle(s: string): string {
		return getSlot(s)?.title ?? s;
	}

	let filledSampleColumns = $derived(SAMPLE_COLUMNS.filter((c) => present(val(c.key))));
	let filledSiteFields = $derived(SITE_INHERITED.filter((c) => present(val(c.key))));

	/** Anything else on the sample object that isn't one of our known columns
	 *  must be a sample_values entry (other MIxS slot or misc_param:* tag).
	 *  Filter out housekeeping columns so we don't render them. */
	const HOUSEKEEPING = new Set([
		'id', 'project_id', 'site_id', 'mixs_checklist', 'extension',
		'samp_name', 'collection_date', 'project_name', 'site_name',
		'latitude', 'longitude', 'notes',
		'sync_version', 'is_deleted', 'created_by', 'created_at', 'updated_at',
		'client_id', 'local_created_at',
		...SAMPLE_COLUMNS.map((c) => c.key),
		...SITE_INHERITED.map((c) => c.key)
	]);

	let extraSlots = $derived.by(() => {
		const out: { slot: string; value: unknown; title: string; isCustom: boolean }[] = [];
		for (const [k, v] of Object.entries(sample)) {
			if (HOUSEKEEPING.has(k)) continue;
			if (!present(v)) continue;
			const isCustom = k.startsWith(MISC_PARAM_PREFIX);
			out.push({
				slot: k,
				value: v,
				title: isCustom ? k.slice(MISC_PARAM_PREFIX.length) : slotTitle(k),
				isCustom
			});
		}
		return out.sort((a, b) => {
			// Custom tags last; everything else alphabetical
			if (a.isCustom !== b.isCustom) return a.isCustom ? 1 : -1;
			return a.slot.localeCompare(b.slot);
		});
	});
	let mixsExtras = $derived(extraSlots.filter((e) => !e.isCustom));
	let customTags = $derived(extraSlots.filter((e) => e.isCustom));

	const fieldRowCls = 'flex justify-between py-1 border-b border-slate-800/50';
	const labelCls = 'text-slate-400';
	const valueCls = 'text-slate-200';
</script>

<div class="space-y-6">
	<div>
		<a href="/samples" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Samples</a>
		<div class="flex items-center justify-between mt-1">
			<div class="flex items-center gap-3">
				<h1 class="text-2xl font-bold text-white">{sample.samp_name}</h1>
				<span class="px-2 py-0.5 text-xs rounded bg-slate-800 text-slate-300">
					{sample.mixs_checklist}{sample.extension ? ' + ' + sample.extension : ''}
				</span>
			</div>
			<a href="/samples/{sample.id}/edit" class="px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Edit</a>
		</div>
		<p class="text-slate-400 mt-1">
			Project: <a href="/projects/{sample.project_id}" class="text-ocean-400 hover:text-ocean-300">{sample.project_name}</a>
			{#if sample.site_name}
				&middot; Site: <a href="/sites/{sample.site_id}" class="text-ocean-400 hover:text-ocean-300">{sample.site_name}</a>
			{/if}
		</p>
	</div>

	<!-- Identity / what + when -->
	<div class="rounded-lg border border-slate-800 p-5 space-y-3">
		<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Identity</h2>
		<dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
			<div class={fieldRowCls}>
				<dt class={labelCls}><GlossaryDoc slot="samp_name" label="Sample Name" /></dt>
				<dd class={valueCls}>{sample.samp_name || '—'}</dd>
			</div>
			<div class={fieldRowCls}>
				<dt class={labelCls}><GlossaryDoc slot="collection_date" label="Collection Date" /></dt>
				<dd class={valueCls}>{sample.collection_date || '—'}</dd>
			</div>
		</dl>
	</div>

	<!-- Inherited from site -->
	{#if filledSiteFields.length > 0}
		<div class="rounded-lg border border-slate-800 p-5 space-y-3">
			<div class="flex items-baseline justify-between">
				<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Inherited from site</h2>
				<a href="/sites/{sample.site_id}" class="text-xs text-ocean-400 hover:text-ocean-300">{sample.site_name} →</a>
			</div>
			<dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
				{#each filledSiteFields as f}
					<div class={fieldRowCls}>
						<dt class={labelCls}><GlossaryDoc slot={f.key} label={slotTitle(f.key)} /></dt>
						<dd class={valueCls}>{val(f.key)}</dd>
					</div>
				{/each}
			</dl>
		</div>
	{/if}

	<!-- Sample-specific (column-stored) -->
	{#if filledSampleColumns.length > 0}
		<div class="rounded-lg border border-slate-800 p-5 space-y-3">
			<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Sample data</h2>
			<dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
				{#each filledSampleColumns as c}
					<div class={fieldRowCls}>
						<dt class={labelCls}><GlossaryDoc slot={c.key} label={slotTitle(c.key)} /></dt>
						<dd class={valueCls}>{val(c.key)}{c.unit ? ' ' + c.unit : ''}</dd>
					</div>
				{/each}
			</dl>
		</div>
	{/if}

	<!-- Other MIxS parameters (sample_values EAV) -->
	{#if mixsExtras.length > 0}
		<div class="rounded-lg border border-slate-800 p-5 space-y-3">
			<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">
				Other MIxS parameters
				<span class="text-xs text-slate-500 normal-case tracking-normal font-normal">({mixsExtras.length})</span>
			</h2>
			<dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
				{#each mixsExtras as e}
					<div class={fieldRowCls}>
						<dt class={labelCls}>
							<GlossaryDoc slot={e.slot} label={e.title} />
							<span class="text-xs text-slate-600 ml-1 font-mono">{e.slot}</span>
						</dt>
						<dd class={valueCls}>{e.value}</dd>
					</div>
				{/each}
			</dl>
		</div>
	{/if}

	<!-- Additional parameters (misc_param:*) -->
	{#if customTags.length > 0}
		<div class="rounded-lg border border-slate-800 p-5 space-y-3">
			<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">
				Additional parameters
				<span class="text-xs text-slate-500 normal-case tracking-normal font-normal">({customTags.length})</span>
			</h2>
			<dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
				{#each customTags as e}
					<div class={fieldRowCls}>
						<dt class={labelCls}>
							<span class="font-mono text-xs text-slate-500">misc_param:</span><span class="font-mono text-xs text-slate-200">{e.title}</span>
							<GlossaryDoc slot="misc_param" iconOnly class="ml-1" />
						</dt>
						<dd class={valueCls}>{e.value}</dd>
					</div>
				{/each}
			</dl>
		</div>
	{/if}

	<!-- Notes -->
	{#if sample.notes}
		<div class="rounded-lg border border-slate-800 p-5">
			<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-2">Notes</h2>
			<p class="text-sm text-slate-300 whitespace-pre-wrap">{sample.notes}</p>
		</div>
	{/if}

	{#if data.people.length > 0}
		<div class="rounded-lg border border-slate-800 p-5 space-y-3">
			<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">People</h2>
			<PeopleRoster people={data.people} />
		</div>
	{/if}

	<!-- Photos -->
	<div>
		<div class="flex items-center justify-between mb-3">
			<h2 class="text-lg font-semibold text-white">Photos ({photos.length})</h2>
			<label class="px-3 py-1.5 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium cursor-pointer {uploading ? 'opacity-50 pointer-events-none' : ''}">
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
			<div class="mb-3 px-3 py-2 rounded border border-red-900 bg-red-950/40 text-sm text-red-300">{uploadError}</div>
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
								src="/api/samples/{sample.id}/photos/{photo.id}"
								alt={photo.caption ?? photo.original_filename ?? 'Sample photo'}
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
					src="/api/samples/{sample.id}/photos/{lightboxPhoto.id}"
					alt={lightboxPhoto.caption ?? lightboxPhoto.original_filename ?? 'Sample photo'}
					class="max-h-[85vh] max-w-[90vw] object-contain rounded"
				/>
				<div class="flex items-center gap-4 text-sm text-slate-300">
					{#if lightboxPhoto.caption}<span>{lightboxPhoto.caption}</span>{:else if lightboxPhoto.original_filename}<span class="text-slate-500">{lightboxPhoto.original_filename}</span>{/if}
					<a
						href="/api/samples/{sample.id}/photos/{lightboxPhoto.id}"
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

	<!-- Extracts -->
	<div>
		<div class="flex items-center justify-between mb-3">
			<h2 class="text-lg font-semibold text-white">Extracts ({data.extracts.length})</h2>
			<a
				href="/extracts/new?sample_id={sample.id}"
				class="px-3 py-1.5 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium"
			>
				Add Extract
			</a>
		</div>
		<DataTable
			columns={extractColumns}
			rows={data.extracts}
			href={(row) => `/extracts/${row.id}`}
			empty="No extracts yet."
		/>
	</div>

</div>
