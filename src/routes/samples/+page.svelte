<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import MapPicker from '$lib/components/MapPicker.svelte';
	import { goto } from '$app/navigation';
	import { cart, type CartEntityType } from '$lib/stores/cart.svelte';
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

	const columns = [
		{ key: 'samp_name', label: 'Sample', sortable: true },
		{ key: 'project_name', label: 'Project', sortable: true },
		{ key: 'site_name', label: 'Site', sortable: true },
		{ key: 'geo_loc_name', label: 'Location', sortable: true },
		{ key: 'env_broad_scale', label: 'Biome', sortable: true },
		{ key: 'env_local_scale', label: 'Feature', sortable: true },
		{ key: 'env_medium', label: 'Medium', sortable: true },
		{ key: 'collection_date', label: 'Collected', sortable: true },
		{ key: 'people_summary', label: 'People', sortable: true }
	];

	/** Mirrored from the DataTable so the map pins can adopt the same tint. */
	let colorByKey = $state('');

	function pinColorForValue(v: unknown): string | undefined {
		if (v == null || v === '') return undefined;
		const s = String(v);
		let h = 0;
		for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
		const hue = Math.abs(h) % 360;
		return `hsl(${hue}, 65%, 55%)`;
	}

	let markers = $derived(
		displaySamples
			.filter((s: any) => s.latitude != null && s.longitude != null)
			.map((s: any) => ({
				lat: s.latitude,
				lng: s.longitude,
				label: `${s.samp_name} (${s.site_name})`,
				href: `/samples/${s.id}`,
				color: colorByKey ? pinColorForValue(s[colorByKey]) : undefined
			}))
	);

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
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-white">Samples</h1>
		<div class="flex items-center gap-2">
			{#if selectionChanged}
				<button onclick={updateCart} class="px-3 py-2 border border-ocean-700 text-ocean-400 rounded-lg hover:bg-ocean-900/30 transition-colors text-sm font-medium">
					Update Cart ({selectedIds.size})
				</button>
			{/if}
			<a href="/samples/new" class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">New Sample</a>
		</div>
	</div>

	{#if markers.length > 0}
		<MapPicker latitude={null} longitude={null} {markers} readonly height="400px" />
	{/if}

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
		bind:colorByKey
	/>
</div>
