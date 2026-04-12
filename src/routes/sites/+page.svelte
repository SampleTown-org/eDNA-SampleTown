<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import MapPicker from '$lib/components/MapPicker.svelte';
	import { goto } from '$app/navigation';
	import { cart } from '$lib/stores/cart.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let allSites = $state(data.sites as any[]);
	let selectedIds = $state(new Set<string>());

	// Cart filtering: if the cart has projects, only show sites from those projects
	const cartProjectIds = $derived(cart.idsOfType('project'));
	const hasCartFilter = $derived(cartProjectIds.size > 0);
	let cartFilterActive = $state(true);

	let sites = $derived(
		hasCartFilter && cartFilterActive
			? allSites.filter((s: any) => cartProjectIds.has(s.project_id))
			: allSites
	);

	function addToCart() {
		const items = sites
			.filter((s) => selectedIds.has(s.id))
			.map((s) => ({
				type: 'site' as const,
				id: s.id,
				label: s.site_name,
				sublabel: s.project_name
			}));
		cart.addMany(items);
		cart.openSidebar();
		selectedIds = new Set();
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
			{#if selectedIds.size > 0}
				<button onclick={addToCart} class="px-3 py-2 border border-ocean-700 text-ocean-400 rounded-lg hover:bg-ocean-900/30 transition-colors text-sm font-medium">
					Add {selectedIds.size} to Cart
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
		cartFilterLabel={hasCartFilter ? `showing ${sites.length}/${allSites.length} sites` : ''}
		bind:cartFilterActive
		editHref={(row) => `/sites/${row.id}/edit`}
		ondelete={deleteSite}
		onduplicate={duplicateSite}
	/>
</div>
