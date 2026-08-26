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

	/** Plates and sequencing runs belong to the lab, not to any one project, so
	 *  one holding another project's work keeps it and only this project's wells
	 *  and libraries come off. One this delete empties completely is removed —
	 *  see src/lib/server/project-delete.ts. */
	type DeleteCounts = {
		sites: number; samples: number; extracts: number;
		pcrs: number; libraries: number; runs: number; plates: number;
	};
	const COUNT_LABELS: [keyof DeleteCounts, string, string][] = [
		['sites', 'site', 'sites'],
		['samples', 'sample', 'samples'],
		['extracts', 'DNA extract', 'DNA extracts'],
		['pcrs', 'PCR reaction', 'PCR reactions'],
		['libraries', 'library prep', 'library preps'],
		['runs', 'sequencing run', 'sequencing runs'],
		['plates', 'plate', 'plates']
	];

	async function fetchDeleteCounts(id: string): Promise<DeleteCounts | null> {
		const res = await fetch(`/api/projects/${id}/delete-preview`);
		return res.ok ? ((await res.json()) as DeleteCounts) : null;
	}

	/** Itemise what goes, so the scale of a delete is visible before confirming.
	 *  Rows that would delete nothing are left out rather than shown as zero. */
	function describeCounts(c: DeleteCounts): string {
		const lines = COUNT_LABELS
			.filter(([key]) => c[key] > 0)
			.map(([key, one, many]) => `  · ${c[key]} ${c[key] === 1 ? one : many}`);
		return lines.length > 0 ? lines.join('\n') : '  · nothing — this project is empty';
	}

	const CONTAINER_NOTE =
		'Plates and sequencing runs are counted above only when this project\'s work was all '
		+ 'they held. Any still holding another project\'s wells or libraries are kept, and so '
		+ 'are plates and runs that were already empty.';

	async function deleteProject(row: Record<string, unknown>) {
		const counts = await fetchDeleteCounts(row.id as string);
		if (!counts) {
			alert(`Could not check what "${row.project_name}" contains. Not deleted.`);
			return;
		}
		const msg = `Delete project "${row.project_name}"?\n\nThis permanently deletes:\n`
			+ `${describeCounts(counts)}\n\n${CONTAINER_NOTE}\n\nThis cannot be undone.`;
		if (!confirm(msg)) return;
		const res = await fetch(`/api/projects/${row.id}`, { method: 'DELETE' });
		if (!res.ok) {
			const err = await res.json().catch(() => null);
			alert(`Could not delete "${row.project_name}": ${err?.error ?? `HTTP ${res.status}`}`);
			return;
		}
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
		const ids = rs.map((r) => r.id as string);
		const each = await Promise.all(ids.map((id) => fetchDeleteCounts(id)));
		if (each.some((c) => c === null)) {
			alert('Could not check what these projects contain. Nothing was deleted.');
			return;
		}
		const total = (each as DeleteCounts[]).reduce(
			(acc, c) => {
				for (const [key] of COUNT_LABELS) acc[key] += c[key];
				return acc;
			},
			{ sites: 0, samples: 0, extracts: 0, pcrs: 0, libraries: 0, runs: 0, plates: 0 } as DeleteCounts
		);

		const msg = `Delete ${rs.length} projects?\n\nThis permanently deletes, across them:\n`
			+ `${describeCounts(total)}\n\n${CONTAINER_NOTE}\n\nThis cannot be undone.`;
		if (!confirm(msg)) return;

		const results = await Promise.all(
			ids.map(async (id) => ({
				id,
				res: await fetch(`/api/projects/${id}`, { method: 'DELETE' })
			}))
		);
		// Drop only what the server actually deleted, so a partial failure leaves
		// the surviving projects on screen instead of hiding them until reload.
		const removed = new Set(results.filter((r) => r.res.ok).map((r) => r.id));
		const failed = results.filter((r) => !r.res.ok).length;
		if (failed > 0) alert(`${failed} of ${ids.length} projects could not be deleted.`);
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
	<h1 class="text-2xl font-bold text-white">{data.lab?.name ? data.lab.name + " " : ""}Projects</h1>

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
	>
		{#snippet filterActions()}
			{#if selectionChanged}
				<button onclick={updateCart} class="hidden sm:inline-flex write-only px-3 py-1.5 border border-ocean-700 text-ocean-400 rounded-lg hover:bg-ocean-900/30 transition-colors text-sm font-medium">Update Cart ({selectedIds.size})</button>
			{/if}
			<a href="/projects/new" class="hidden sm:inline-flex write-only px-3 py-1.5 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">New Project</a>
		{/snippet}
	</DataTable>
</div>
