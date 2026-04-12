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

	// Parent filter: always active — carted projects narrow what's visible
	const cartProjectIds = $derived(cart.idsOfType('project'));
	const hasParentFilter = $derived(cartProjectIds.size > 0);

	// Self-type filter: funnel toggle narrows to only carted sites
	const cartSiteIds = $derived(cart.idsOfType('site'));
	let selfFilterActive = $state(false);

	const hasCartFilter = $derived(hasParentFilter || (cartSiteIds.size > 0 && selfFilterActive));

	let sites = $derived.by(() => {
		let result = allSites;
		// Parent filter always applies
		if (hasParentFilter) {
			result = result.filter((s: any) => cartProjectIds.has(s.project_id));
		}
		// Self filter only when toggled on
		if (selfFilterActive && cartSiteIds.size > 0) {
			result = result.filter((s: any) => cartSiteIds.has(s.id));
		}
		return result;
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

	const columns = [
		{ key: 'site_name', label: 'Site', sortable: true },
		{ key: 'project_name', label: 'Project', sortable: true },
		{ key: 'geo_loc_name', label: 'Location', sortable: true },
		{ key: 'env_package', label: 'Env Package', sortable: true },
		{ key: 'habitat_type', label: 'Habitat', sortable: true },
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

	let markers = $derived(
		sites
			.filter((s: any) => s.latitude != null && s.longitude != null)
			.map((s: any) => ({
				lat: s.latitude,
				lng: s.longitude,
				label: `${s.site_name} (${s.sample_count} samples)`,
				href: `/sites/${s.id}`,
				color: colorByKey ? pinColorForValue(s[colorByKey]) : undefined
			}))
	);

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
		<MapPicker latitude={null} longitude={null} {markers} readonly height="400px" />
	{/if}

	<DataTable
		{columns}
		rows={sites}
		bind:colorByKey
		bind:selectedIds
		href={(row) => `/sites/${row.id}`}
		empty="No sites yet."
		showId
		filterable
		selectable
		cartFilterLabel={hasParentFilter || cartSiteIds.size > 0 ? `showing ${sites.length}/${allSites.length} sites` : ''}
		bind:cartFilterActive={selfFilterActive}
		editHref={(row) => `/sites/${row.id}/edit`}
		ondelete={deleteSite}
		onduplicate={duplicateSite}
	/>
</div>
