<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import { goto } from '$app/navigation';
	import { cart } from '$lib/stores/cart.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let projects = $state(data.projects as any[]);
	let selectedIds = $state(new Set<string>());

	const columns = [
		{ key: 'project_name', label: 'Project', sortable: true },
		{ key: 'pi_name', label: 'PI', sortable: true },
		{ key: 'institution', label: 'Institution', sortable: true },
		{ key: 'sample_count', label: 'Samples', sortable: true },
		{ key: 'created_at', label: 'Created', sortable: true }
	];

	function addToCart() {
		const items = projects
			.filter((p) => selectedIds.has(p.id))
			.map((p) => ({
				type: 'project' as const,
				id: p.id,
				label: p.project_name,
				sublabel: p.pi_name || p.institution || undefined
			}));
		cart.addMany(items);
		cart.openSidebar();
		selectedIds = new Set();
	}

	async function deleteProject(row: Record<string, unknown>) {
		if (!confirm(`Delete project "${row.project_name}"? This will delete all associated data.`)) return;
		await fetch(`/api/projects/${row.id}`, { method: 'DELETE' });
		projects = projects.filter(p => p.id !== row.id);
	}

	async function duplicateProject(row: Record<string, unknown>) {
		const res = await fetch(`/api/projects/${row.id}`);
		if (!res.ok) return;
		const orig = await res.json();
		const body = { ...orig, project_name: `${orig.project_name} (copy)`, id: undefined, created_at: undefined, updated_at: undefined };
		const created = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (created.ok) { const p = await created.json(); goto(`/projects/${p.id}`); }
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-white">Projects</h1>
		<div class="flex items-center gap-2">
			{#if selectedIds.size > 0}
				<button onclick={addToCart} class="px-3 py-2 border border-ocean-700 text-ocean-400 rounded-lg hover:bg-ocean-900/30 transition-colors text-sm font-medium">
					Add {selectedIds.size} to Cart
				</button>
			{/if}
			<a href="/projects/new" class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">New Project</a>
		</div>
	</div>

	<DataTable
		{columns}
		bind:rows={projects}
		bind:selectedIds
		href={(row) => `/projects/${row.id}`}
		empty="No projects yet. Create one to get started."
		showId
		filterable
		selectable
		editHref={(row) => `/projects/${row.id}/edit`}
		ondelete={deleteProject}
		onduplicate={duplicateProject}
	/>
</div>
