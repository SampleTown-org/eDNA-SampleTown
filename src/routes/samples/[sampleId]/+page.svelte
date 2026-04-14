<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import PeopleRoster from '$lib/components/PeopleRoster.svelte';
	import GlossaryDoc from '$lib/components/GlossaryDoc.svelte';
	import { getSlot } from '$lib/mixs/schema-index';
	import { slotTable } from '$lib/mixs/slot-ownership';
	import { MISC_PARAM_PREFIX } from '$lib/mixs/sample-form';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const sample = data.sample as Record<string, unknown>;

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
