<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import MapPicker from '$lib/components/MapPicker.svelte';
	import { goto } from '$app/navigation';
	import { cart, type CartEntityType } from '$lib/stores/cart.svelte';
	import { makeRankedHueMap, hueToMapPin, hashHue } from '$lib/color-rank';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let allSites = $state(data.sites as any[]);

	// Initialize selection from what's already carted
	let selectedIds = $state(new Set(cart.getByType('site').map((i) => i.id)));

	// Parent filter: carted projects narrow what's visible (togglable via funnel)
	const cartProjectIds = $derived(cart.idsOfType('project'));
	const hasParentFilter = $derived(cartProjectIds.size > 0);
	let parentFilterActive = $state(true);

	/** Project picker above the table. Narrows both the table and the map, and
	 *  is independent of the cart-driven parent filter. */
	let projectFilter = $state('');
	const projectOptions = $derived.by(() => {
		const byId = new Map<string, string>();
		for (const s of allSites as any[]) {
			if (s.project_id && !byId.has(s.project_id)) byId.set(s.project_id, s.project_name ?? '—');
		}
		return Array.from(byId, ([id, name]) => ({ id, name })).sort((a, b) =>
			a.name.localeCompare(b.name)
		);
	});

	let sites = $derived.by(() => {
		let rows = allSites;
		if (hasParentFilter && parentFilterActive) {
			rows = rows.filter((s: any) => cartProjectIds.has(s.project_id));
		}
		if (projectFilter) rows = rows.filter((s: any) => s.project_id === projectFilter);
		return rows;
	});

	/** Whether any site in the lab has coordinates at all — the map is worth
	 *  drawing for a filter that currently matches nothing, but not for a lab
	 *  that has never recorded a position. */
	const hasMappableSites = $derived(
		allSites.some((s: any) => s.latitude != null && s.longitude != null)
	);

	/** The cart filter survives a reload, so a table it has emptied must not
	 *  claim the lab has no sites. */
	const emptyMessage = $derived.by(() => {
		if (allSites.length === 0) return 'No sites yet.';
		const hiding: string[] = [];
		if (hasParentFilter && parentFilterActive) hiding.push('the cart');
		if (projectFilter) hiding.push('the project picker');
		if (hiding.length === 0) return 'No sites yet.';
		return `All ${allSites.length} sites are hidden by ${hiding.join(' and ')}.`;
	});

	// Detect when selection has diverged from the cart
	const selectionChanged = $derived.by(() => {
		const carted = cart.idsOfType('site');
		if (selectedIds.size !== carted.size) return true;
		for (const id of selectedIds) if (!carted.has(id)) return true;
		return false;
	});

	function updateCart() {
		cart.clearType('site');
		const items = allSites
			.filter((s) => selectedIds.has(s.id))
			.map((s) => ({
				type: 'site' as const,
				id: s.id,
				label: s.site_name,
				sublabel: s.project_name
			}));
		if (items.length > 0) cart.addMany(items);
		cart.openSidebar();
	}
	/** Mirrored from the DataTable so the map pins can adopt the same tint.
	 *  Defaults to the project: on a map of several projects' sites, which
	 *  project a pin belongs to is the first thing worth being able to see. */
	let colorByKey = $state('project_name');

	/** Strip ENVO ontology codes like [ENVO:00000447] from display values. */
	function stripEnvo(v: unknown): string {
		if (v == null) return '';
		return String(v).replace(/\s*\[ENVO:\d+\]\s*/g, '').trim();
	}

	// Pre-process sites for display: strip ENVO codes
	let displaySites = $derived(sites.map((s: any) => ({
		...s,
		env_broad_scale: stripEnvo(s.env_broad_scale),
		env_local_scale: stripEnvo(s.env_local_scale)
	})));

	const columns = [
		{ key: 'site_code', label: 'Code', sortable: true },
		{ key: 'site_name', label: 'Site', sortable: true },
		{ key: 'project_name', label: 'Project', sortable: true },
		{ key: 'latitude', label: 'Lat', sortable: true },
		{ key: 'longitude', label: 'Lon', sortable: true },
		{ key: 'geo_loc_name', label: 'Location', sortable: true },
		{ key: 'env_broad_scale', label: 'Biome', sortable: true },
		{ key: 'env_local_scale', label: 'Feature', sortable: true },
		{ key: 'sample_count', label: 'Samples', sortable: true },
		{ key: 'photo_count', label: 'Photos', sortable: true }
	];

	/** Rank-based pin coloring — same ordering as the DataTable's color tint,
	 *  so the map reads as a visual gradient when the color-by column is
	 *  numeric (e.g. sample_count, depth). */
	const pinRankMap = $derived(colorByKey ? makeRankedHueMap(sites, colorByKey) : null);
	function pinColorForValue(v: unknown): string | undefined {
		if (v == null || v === '') return undefined;
		const s = String(v);
		const hue = pinRankMap?.get(s) ?? hashHue(s);
		return hueToMapPin(hue);
	}

	/** Friendly label for the color-by column so the tooltip reads
	 *  "Biome: marine biome [ENVO:...]" instead of "env_broad_scale: …". */
	const colorByLabel = $derived(
		colorByKey ? (columns.find((c) => c.key === colorByKey)?.label ?? colorByKey) : ''
	);
	let markers = $derived(
		sites
			.filter((s: any) => s.latitude != null && s.longitude != null)
			.map((s: any) => {
				const v = colorByKey ? s[colorByKey] : null;
				const isNull = Boolean(colorByKey) && (v == null || v === '');
				return {
					id: s.id,
					lat: s.latitude,
					lng: s.longitude,
					label: `${s.site_name} (${s.sample_count} samples)`,
					href: `/sites/${s.id}`,
					color: colorByKey && !isNull ? pinColorForValue(v) : undefined,
					nullValue: isNull,
					colorLabel: colorByKey ? colorByLabel : undefined,
					colorValue: colorByKey ? (isNull ? '—' : String(v)) : undefined
				};
			})
	);

	/** Shift-drag a rectangle on the map to batch-select every contained pin.
	 *  Each drag replaces the existing selection — drawing a new area is
	 *  "selecting that area", not accumulating across drags. */
	function replaceFromBox(ids: string[]) {
		selectedIds = new Set(ids);
	}

	async function deleteSite(row: Record<string, unknown>) {
		if (!confirm(`Delete site "${row.site_name}"?`)) return;
		const res = await fetch(`/api/sites/${row.id}`, { method: 'DELETE' });
		if (res.ok) allSites = allSites.filter(s => s.id !== row.id);
	}

	async function duplicateSite(row: Record<string, unknown>) {
		const res = await fetch(`/api/sites/${row.id}`);
		if (!res.ok) return;
		const original = await res.json();
		const body = { ...original, site_name: `${original.site_name} (copy)`, id: undefined, created_at: undefined, updated_at: undefined };
		const created = await fetch('/api/sites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (created.ok) { const newSite = await created.json(); goto(`/sites/${newSite.id}`); }
	}

	async function bulkDeleteSites(rs: Record<string, unknown>[]) {
		if (!confirm(`Delete ${rs.length} sites? This can't be undone.`)) return;
		const ids = rs.map((r) => r.id as string);
		await Promise.all(ids.map((id) => fetch(`/api/sites/${id}`, { method: 'DELETE' })));
		const removed = new Set(ids);
		allSites = allSites.filter((s) => !removed.has(s.id));
		selectedIds = new Set([...selectedIds].filter((id) => !removed.has(id)));
	}

	async function bulkDuplicateSites(rs: Record<string, unknown>[]) {
		if (!confirm(`Duplicate ${rs.length} sites?`)) return;
		const created: any[] = [];
		for (const r of rs) {
			const res = await fetch(`/api/sites/${r.id}`);
			if (!res.ok) continue;
			const orig = await res.json();
			const body = { ...orig, site_name: `${orig.site_name} (copy)`, id: undefined, created_at: undefined, updated_at: undefined };
			const dup = await fetch('/api/sites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
			if (dup.ok) created.push(await dup.json());
		}
		if (created.length > 0) allSites = [...created, ...allSites];
	}
</script>

<div class="space-y-6">
	<h1 class="text-2xl font-bold text-white">{data.lab?.name ? data.lab.name + " " : ""}Sites</h1>

	{#if projectOptions.length > 1}
		<div class="flex items-center gap-2 text-xs">
			<label for="site_project_filter" class="text-slate-400">Project</label>
			<select
				id="site_project_filter"
				bind:value={projectFilter}
				class="px-2 py-1 bg-slate-800 border border-slate-700 rounded-lg text-white text-xs focus:outline-none focus:border-ocean-500"
			>
				<option value="">All projects ({allSites.length})</option>
				{#each projectOptions as p (p.id)}
					<option value={p.id}>{p.name}</option>
				{/each}
			</select>
			{#if projectFilter}
				<span class="text-slate-500">showing {sites.length} of {allSites.length} sites</span>
			{/if}
		</div>
	{/if}

	<!-- Shown whenever the lab has anything mappable, not merely when the
	     current filter does: a map that vanishes on an empty result takes the
	     page's layout with it and hides where the sites were. -->
	{#if hasMappableSites}
		<MapPicker latitude={null} longitude={null} {markers} readonly height="400px" onboxselect={replaceFromBox} />
	{/if}

	<DataTable
		{columns}
		rows={displaySites}
		bind:colorByKey
		bind:selectedIds
		href={(row) => `/sites/${row.id}`}
		empty={emptyMessage}
		showId
		filterable
		selectable
		cartFilterLabel={hasParentFilter ? `showing ${sites.length}/${allSites.length} sites` : ''}
		bind:cartFilterActive={parentFilterActive}
		editHref={(row) => `/sites/${row.id}/edit`}
		ondelete={deleteSite}
		onduplicate={duplicateSite}
		onbulkdelete={bulkDeleteSites}
		onbulkduplicate={bulkDuplicateSites}
	>
		{#snippet filterActions()}
			{#if selectedIds.size > 0}
				<button onclick={() => (selectedIds = new Set())} class="hidden sm:inline-flex write-only px-3 py-1.5 border border-slate-700 text-slate-400 rounded-lg hover:bg-slate-800 hover:text-white transition-colors text-sm" title="Clear the current selection">Clear ({selectedIds.size})</button>
			{/if}
			{#if selectionChanged}
				<button onclick={updateCart} class="hidden sm:inline-flex write-only px-3 py-1.5 border border-ocean-700 text-ocean-400 rounded-lg hover:bg-ocean-900/30 transition-colors text-sm font-medium">Update Cart ({selectedIds.size})</button>
			{/if}
			<a href="/sites/new" class="hidden sm:inline-flex write-only px-3 py-1.5 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">New Site</a>
		{/snippet}
	</DataTable>
</div>
