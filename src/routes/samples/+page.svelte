<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import MapPicker from '$lib/components/MapPicker.svelte';
	import { goto } from '$app/navigation';
	import { cart, type CartEntityType } from '$lib/stores/cart.svelte';
	import { makeRankedHueMap, hueToMapPin, hashHue } from '$lib/color-rank';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let allSamples = $state(data.samples as any[]);

	// Initialize selection from what's already carted
	let selectedIds = $state(new Set(cart.getByType('sample').map((i) => i.id)));

	// Parent filter: carted projects/sites narrow what's visible (togglable via funnel)
	const cartProjectIds = $derived(cart.idsOfType('project'));
	const cartSiteIds = $derived(cart.idsOfType('site'));
	const hasParentFilter = $derived(cartProjectIds.size > 0 || cartSiteIds.size > 0);
	let parentFilterActive = $state(true);

	let samples = $derived.by(() => {
		if (!hasParentFilter || !parentFilterActive) return allSamples;
		return allSamples.filter((s: any) =>
			(cartProjectIds.size === 0 || cartProjectIds.has(s.project_id)) &&
			(cartSiteIds.size === 0 || cartSiteIds.has(s.site_id))
		);
	});

	// Detect when selection has diverged from the cart
	const selectionChanged = $derived.by(() => {
		const carted = cart.idsOfType('sample');
		if (selectedIds.size !== carted.size) return true;
		for (const id of selectedIds) if (!carted.has(id)) return true;
		return false;
	});

	function updateCart() {
		// Remove all samples from cart, then re-add the selected ones
		cart.clearType('sample');
		const items = allSamples
			.filter((s) => selectedIds.has(s.id))
			.map((s) => ({
				type: 'sample' as const,
				id: s.id,
				label: s.samp_name,
				sublabel: s.project_name
			}));
		if (items.length > 0) cart.addMany(items);
		cart.openSidebar();
	}

	/** Strip ENVO ontology codes like [ENVO:00000447] from display values. */
	function stripEnvo(v: unknown): string {
		if (v == null) return '';
		return String(v).replace(/\s*\[ENVO:\d+\]\s*/g, '').trim();
	}

	let displaySamples = $derived(samples.map((s: any) => ({
		...s,
		env_broad_scale: stripEnvo(s.env_broad_scale),
		env_local_scale: stripEnvo(s.env_local_scale),
		env_medium: stripEnvo(s.env_medium)
	})));

	const DEFAULT_COLUMNS = [
		{ key: 'samp_name', label: 'Sample', sortable: true },
		{ key: 'project_name', label: 'Project', sortable: true },
		{ key: 'site_name', label: 'Site', sortable: true },
		{ key: 'geo_loc_name', label: 'Location', sortable: true },
		{ key: 'env_broad_scale', label: 'Biome', sortable: true },
		{ key: 'env_local_scale', label: 'Feature', sortable: true },
		{ key: 'env_medium', label: 'Medium', sortable: true },
		{ key: 'collection_date', label: 'Collected', sortable: true },
		{ key: 'people_summary', label: 'People', sortable: true },
		{ key: 'photo_count', label: 'Photos', sortable: true }
	];

	// User-added optional columns, persisted across reloads.
	const EXTRA_COLS_KEY = 'samples.extraColumns';
	let extraColumnSlots = $state<string[]>(
		(typeof localStorage !== 'undefined' && (() => {
			try { return JSON.parse(localStorage.getItem(EXTRA_COLS_KEY) || '[]'); } catch { return []; }
		})()) || []
	);
	$effect(() => {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(EXTRA_COLS_KEY, JSON.stringify(extraColumnSlots));
		}
	});

	const parameterTitles = $derived(
		Object.fromEntries(data.availableParameters.map((p: any) => [p.slot, p.title]))
	);

	const columns = $derived([
		...DEFAULT_COLUMNS,
		...extraColumnSlots
			.filter((slot) => parameterTitles[slot])
			.map((slot) => ({ key: slot, label: parameterTitles[slot], sortable: true }))
	]);

	let addParamValue = $state('');
	const pickableParameters = $derived(
		data.availableParameters.filter((p: any) => !extraColumnSlots.includes(p.slot))
	);
	function onAddParameter() {
		if (!addParamValue) return;
		if (!extraColumnSlots.includes(addParamValue)) {
			extraColumnSlots = [...extraColumnSlots, addParamValue];
		}
		addParamValue = '';
	}
	function removeExtraColumn(slot: string) {
		extraColumnSlots = extraColumnSlots.filter((s) => s !== slot);
	}

	/** Mirrored from the DataTable so the map pins can adopt the same tint. */
	let colorByKey = $state('');

	/** Rank-based pin coloring — consistent with the DataTable's tint so
	 *  gradients line up across the map and the table. */
	const pinRankMap = $derived(colorByKey ? makeRankedHueMap(displaySamples, colorByKey) : null);
	function pinColorForValue(v: unknown): string | undefined {
		if (v == null || v === '') return undefined;
		const s = String(v);
		const hue = pinRankMap?.get(s) ?? hashHue(s);
		return hueToMapPin(hue);
	}

	/** Friendly column label for the color-by tooltip line. Columns are the
	 *  default DataTable columns plus any user-added extra parameter. */
	const colorByLabel = $derived.by(() => {
		if (!colorByKey) return '';
		const def = columns.find((c: any) => c.key === colorByKey);
		return def?.label ?? colorByKey;
	});
	let markers = $derived(
		displaySamples
			.filter((s: any) => s.latitude != null && s.longitude != null)
			.map((s: any) => {
				const v = colorByKey ? s[colorByKey] : null;
				const isNull = Boolean(colorByKey) && (v == null || v === '');
				return {
					id: s.id,
					lat: s.latitude,
					lng: s.longitude,
					label: `${s.samp_name} (${s.site_name})`,
					href: `/samples/${s.id}`,
					color: colorByKey && !isNull ? pinColorForValue(v) : undefined,
					nullValue: isNull,
					colorLabel: colorByKey ? colorByLabel : undefined,
					colorValue: colorByKey ? (isNull ? '—' : String(v)) : undefined
				};
			})
	);

	/** Shift-drag a rectangle on the map replaces the existing selection with
	 *  the contained pins — each drag is "select this area", not accumulate. */
	function replaceFromBox(ids: string[]) {
		selectedIds = new Set(ids);
	}

	async function deleteSample(row: Record<string, unknown>) {
		if (!confirm(`Delete sample "${row.samp_name}"?`)) return;
		await fetch(`/api/samples/${row.id}`, { method: 'DELETE' });
		allSamples = allSamples.filter(s => s.id !== row.id);
	}

	async function duplicateSample(row: Record<string, unknown>) {
		const res = await fetch(`/api/samples/${row.id}`);
		if (!res.ok) return;
		const orig = await res.json();
		const body = { ...orig, samp_name: `${orig.samp_name}_copy`, id: undefined, created_at: undefined, updated_at: undefined };
		const created = await fetch('/api/samples', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (created.ok) { const s = await created.json(); goto(`/samples/${s.id}`); }
	}

	async function bulkDeleteSamples(rs: Record<string, unknown>[]) {
		if (!confirm(`Delete ${rs.length} samples? This can't be undone.`)) return;
		const ids = rs.map((r) => r.id as string);
		await Promise.all(ids.map((id) => fetch(`/api/samples/${id}`, { method: 'DELETE' })));
		const removed = new Set(ids);
		allSamples = allSamples.filter((s) => !removed.has(s.id));
		selectedIds = new Set([...selectedIds].filter((id) => !removed.has(id)));
	}

	async function bulkDuplicateSamples(rs: Record<string, unknown>[]) {
		if (!confirm(`Duplicate ${rs.length} samples?`)) return;
		const created: any[] = [];
		for (const r of rs) {
			const res = await fetch(`/api/samples/${r.id}`);
			if (!res.ok) continue;
			const orig = await res.json();
			const body = { ...orig, samp_name: `${orig.samp_name}_copy`, id: undefined, created_at: undefined, updated_at: undefined };
			const dup = await fetch('/api/samples', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
			if (dup.ok) created.push(await dup.json());
		}
		if (created.length > 0) allSamples = [...created, ...allSamples];
	}
</script>

<div class="space-y-4">
	<h1 class="text-2xl font-bold text-white">{data.lab?.name ? data.lab.name + " " : ""}Samples</h1>

	{#if markers.length > 0}
		<MapPicker latitude={null} longitude={null} {markers} readonly height="400px" onboxselect={replaceFromBox} />
	{/if}

	<!-- Optional columns: drawn from MIxS parameters that have data on ≥1 sample.
	     + parameter picker lives on the left; newly-added pills grow to its right. -->
	<div class="flex flex-wrap items-center gap-2 text-xs">
		{#if pickableParameters.length > 0}
			<select
				bind:value={addParamValue}
				onchange={onAddParameter}
				class="px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-ocean-500"
			>
				<option value="">+ parameter</option>
				{#each pickableParameters as p (p.slot)}
					<option value={p.slot}>{p.title}{p.isCustom ? ' (custom)' : ''}</option>
				{/each}
			</select>
		{/if}

		{#each extraColumnSlots as slot (slot)}
			{@const p = data.availableParameters.find((x: any) => x.slot === slot)}
			{#if p}
				<span class="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-slate-700 bg-slate-800/70 text-slate-200">
					{p.title}
					<code class="text-slate-500 text-[10px]">{p.slot}</code>
					<button
						type="button"
						onclick={() => removeExtraColumn(slot)}
						class="text-slate-400 hover:text-red-300 ml-0.5"
						title="Remove column"
					>×</button>
				</span>
			{/if}
		{/each}

		{#if pickableParameters.length === 0 && extraColumnSlots.length === 0 && allSamples.length > 0}
			<!-- Only show the "no extras" hint when there ARE samples but
			     none of them have populated any spill / misc_param slots.
			     A brand-new lab with zero samples gets a cleaner empty
			     state from the table below instead. -->
			<span class="text-slate-600 italic">No extra parameters have data on any sample yet.</span>
		{/if}
	</div>

	<DataTable
		{columns}
		rows={displaySamples}
		bind:selectedIds
		href={(row) => `/samples/${row.id}`}
		empty="No samples yet."
		showId
		filterable
		selectable
		cartFilterLabel={hasParentFilter ? `showing ${samples.length}/${allSamples.length} samples` : ''}
		bind:cartFilterActive={parentFilterActive}
		editHref={(row) => `/samples/${row.id}/edit`}
		ondelete={deleteSample}
		onduplicate={duplicateSample}
		onbulkdelete={bulkDeleteSamples}
		onbulkduplicate={bulkDuplicateSamples}
		bind:colorByKey
	>
		{#snippet filterActions()}
			{#if selectedIds.size > 0}
				<button
					onclick={() => (selectedIds = new Set())}
					class="hidden sm:inline-flex write-only px-3 py-1.5 border border-slate-700 text-slate-400 rounded-lg hover:bg-slate-800 hover:text-white transition-colors text-sm"
					title="Clear the current selection"
				>Clear ({selectedIds.size})</button>
			{/if}
			{#if selectionChanged}
				<button onclick={updateCart} class="hidden sm:inline-flex write-only px-3 py-1.5 border border-ocean-700 text-ocean-400 rounded-lg hover:bg-ocean-900/30 transition-colors text-sm font-medium">Update Cart ({selectedIds.size})</button>
			{/if}
			<a href="/samples/new" class="hidden sm:inline-flex write-only px-3 py-1.5 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">New Sample</a>
		{/snippet}
	</DataTable>
</div>
