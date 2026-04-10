<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import MapPicker from '$lib/components/MapPicker.svelte';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let sites = $state(data.sites as any[]);

	const columns = [
		{ key: 'site_name', label: 'Site', sortable: true },
		{ key: 'project_name', label: 'Project', sortable: true },
		{ key: 'geo_loc_name', label: 'Location', sortable: true },
		{ key: 'env_package', label: 'Env Package', sortable: true },
		{ key: 'habitat_type', label: 'Habitat', sortable: true },
		{ key: 'sample_count', label: 'Samples', sortable: true }
	];

	let markers = $derived(
		sites
			.filter((s: any) => s.latitude != null && s.longitude != null)
			.map((s: any) => ({ lat: s.latitude, lng: s.longitude, label: `${s.site_name} (${s.sample_count} samples)`, href: `/sites/${s.id}` }))
	);

	async function deleteSite(row: Record<string, unknown>) {
		if (!confirm(`Delete site "${row.site_name}"?`)) return;
		const res = await fetch(`/api/sites/${row.id}`, { method: 'DELETE' });
		if (res.ok) sites = sites.filter(s => s.id !== row.id);
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
		<a href="/sites/new" class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">New Site</a>
	</div>

	{#if markers.length > 0}
		<MapPicker latitude={null} longitude={null} {markers} readonly height="400px" />
	{/if}

	<DataTable
		{columns}
		bind:rows={sites}
		href={(row) => `/sites/${row.id}`}
		empty="No sites yet."
		showId
		filterable
		editHref={(row) => `/sites/${row.id}/edit`}
		ondelete={deleteSite}
		onduplicate={duplicateSite}
	/>
</div>
