<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import { goto } from '$app/navigation';
	import { cart, type CartEntityType } from '$lib/stores/cart.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let allProjects = $state(data.projects as any[]);

	// Initialize selection from what's already carted
	let selectedIds = $state(new Set(cart.getByType('project').map((i) => i.id)));

	// No parent filter — projects are top-level. No funnel toggle.
	let projects = $derived(allProjects);

	// Detect when selection has diverged from the cart
	const selectionChanged = $derived.by(() => {
		const carted = cart.idsOfType('project');
		if (selectedIds.size !== carted.size) return true;
		for (const id of selectedIds) if (!carted.has(id)) return true;
		return false;
	});

	function updateCart() {
		cart.clearType('project');
		const items = allProjects
			.filter((p) => selectedIds.has(p.id))
			.map((p) => ({
				type: 'project' as const,
				id: p.id,
				label: p.project_name,
				sublabel: p.pi_name || p.institution || undefined
			}));
		if (items.length > 0) cart.addMany(items);
		cart.openSidebar();
	}

	const columns = [
		{ key: 'project_name', label: 'Project', sortable: true },
		{ key: 'pi_name', label: 'PI', sortable: true },
		{ key: 'institution', label: 'Institution', sortable: true },
		{ key: 'sample_count', label: 'Samples', sortable: true },
		{ key: 'created_at', label: 'Created', sortable: true }
	];

	async function deleteProject(row: Record<string, unknown>) {
		if (!confirm(`Delete project "${row.project_name}"? This will delete all associated data.`)) return;
		await fetch(`/api/projects/${row.id}`, { method: 'DELETE' });
		allProjects = allProjects.filter(p => p.id !== row.id);
	}

	async function duplicateProject(row: Record<string, unknown>) {
		const res = await fetch(`/api/projects/${row.id}`);
		if (!res.ok) return;
		const orig = await res.json();
		const body = { ...orig, project_name: `${orig.project_name} (copy)`, id: undefined, created_at: undefined, updated_at: undefined };
		const created = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (created.ok) { const p = await created.json(); goto(`/projects/${p.id}`); }
	}

	async function bulkDeleteProjects(rs: Record<string, unknown>[]) {
		if (!confirm(`Delete ${rs.length} projects? This will delete all associated data.`)) return;
		const ids = rs.map((r) => r.id as string);
		await Promise.all(ids.map((id) => fetch(`/api/projects/${id}`, { method: 'DELETE' })));
		const removed = new Set(ids);
		allProjects = allProjects.filter((p) => !removed.has(p.id));
		selectedIds = new Set([...selectedIds].filter((id) => !removed.has(id)));
	}
	async function bulkDuplicateProjects(rs: Record<string, unknown>[]) {
		if (!confirm(`Duplicate ${rs.length} projects?`)) return;
		const created: any[] = [];
		for (const r of rs) {
			const res = await fetch(`/api/projects/${r.id}`);
			if (!res.ok) continue;
			const orig = await res.json();
			const body = { ...orig, project_name: `${orig.project_name} (copy)`, id: undefined, created_at: undefined, updated_at: undefined };
			const dup = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
			if (dup.ok) created.push(await dup.json());
		}
		if (created.length > 0) allProjects = [...created, ...allProjects];
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-white">Projects</h1>
		<div class="flex items-center gap-2">
			{#if selectionChanged}
				<button onclick={updateCart} class="px-3 py-2 border border-ocean-700 text-ocean-400 rounded-lg hover:bg-ocean-900/30 transition-colors text-sm font-medium">
					Update Cart ({selectedIds.size})
				</button>
			{/if}
			<a href="/projects/new" class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">New Project</a>
		</div>
	</div>

	<DataTable
		{columns}
		rows={projects}
		bind:selectedIds
		href={(row) => `/projects/${row.id}`}
		empty="No projects yet. Create one to get started."
		showId
		filterable
		selectable
		editHref={(row) => `/projects/${row.id}/edit`}
		ondelete={deleteProject}
		onduplicate={duplicateProject}
		onbulkdelete={bulkDeleteProjects}
		onbulkduplicate={bulkDuplicateProjects}
	/>
</div>
