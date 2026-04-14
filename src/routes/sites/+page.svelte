<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import MapPicker from '$lib/components/MapPicker.svelte';
	import { goto } from '$app/navigation';
	import { cart, type CartEntityType } from '$lib/stores/cart.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let allSites = $state(data.sites as any[]);

	// Initialize selection from what's already carted
	let selectedIds = $state(new Set(cart.getByType('site').map((i) => i.id)));

	// Parent filter: carted projects narrow what's visible (togglable via funnel)
	const cartProjectIds = $derived(cart.idsOfType('project'));
	const hasParentFilter = $derived(cartProjectIds.size > 0);
	let parentFilterActive = $state(true);

	let sites = $derived.by(() => {
		if (!hasParentFilter || !parentFilterActive) return allSites;
		return allSites.filter((s: any) => cartProjectIds.has(s.project_id));
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
	/** Mirrored from the DataTable so the map pins can adopt the same tint. */
	let colorByKey = $state('');

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
		{ key: 'site_name', label: 'Site', sortable: true },
		{ key: 'project_name', label: 'Project', sortable: true },
		{ key: 'latitude', label: 'Lat', sortable: true },
		{ key: 'longitude', label: 'Lon', sortable: true },
		{ key: 'geo_loc_name', label: 'Location', sortable: true },
		{ key: 'env_broad_scale', label: 'Biome', sortable: true },
		{ key: 'env_local_scale', label: 'Feature', sortable: true },
		{ key: 'sample_count', label: 'Samples', sortable: true }
	];

	/** Same hash → HSL hue function as DataTable.colorForValue, but shaped for
	 *  Leaflet circleMarker fills (slightly more saturation/lightness so the
	 *  tint reads against tile imagery). */
	function pinColorForValue(v: unknown): string | undefined {
		if (v == null || v === '') return undefined;
		const s = String(v);
		let h = 0;
		for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
		const hue = Math.abs(h) % 360;
		return `hsl(${hue}, 65%, 55%)`;
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
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-white">Sites</h1>
		<div class="flex items-center gap-2">
			{#if selectionChanged}
				<button onclick={updateCart} class="px-3 py-2 border border-ocean-700 text-ocean-400 rounded-lg hover:bg-ocean-900/30 transition-colors text-sm font-medium">
					Update Cart ({selectedIds.size})
				</button>
			{/if}
			<a href="/sites/new" class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">New Site</a>
		</div>
	</div>

	{#if markers.length > 0}
		<MapPicker latitude={null} longitude={null} {markers} readonly height="400px" onboxselect={replaceFromBox} />
	{/if}

	<DataTable
		{columns}
		rows={displaySites}
		bind:colorByKey
		bind:selectedIds
		href={(row) => `/sites/${row.id}`}
		empty="No sites yet."
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
	/>
</div>
