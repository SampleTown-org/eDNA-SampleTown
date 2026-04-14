<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import { cart, type CartEntityType } from '$lib/stores/cart.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let allRuns = $state(data.runs as any[]);

	// Initialize selection from what's already carted
	let selectedIds = $state(new Set(cart.getByType('run').map((i) => i.id)));

	// Parent filter: carted library plates/libraries narrow what's visible (togglable)
	const cartLibPlateIds = $derived(cart.idsOfType('library_plate'));
	const cartLibIds = $derived(cart.idsOfType('library'));
	const hasParentFilter = $derived(cartLibPlateIds.size > 0 || cartLibIds.size > 0);
	let parentFilterActive = $state(true);

	function runMatchesCart(run: any): boolean {
		if (cartLibPlateIds.size > 0 && run.library_plate_ids) {
			const ids = (run.library_plate_ids as string).split(',');
			if (ids.some((id) => cartLibPlateIds.has(id))) return true;
		}
		if (cartLibIds.size > 0 && run.library_ids) {
			const ids = (run.library_ids as string).split(',');
			if (ids.some((id) => cartLibIds.has(id))) return true;
		}
		return false;
	}

	let runs = $derived.by(() => {
		if (!hasParentFilter || !parentFilterActive) return allRuns;
		return allRuns.filter(runMatchesCart);
	});

	// Detect when selection has diverged from the cart
	const selectionChanged = $derived.by(() => {
		const carted = cart.idsOfType('run');
		if (selectedIds.size !== carted.size) return true;
		for (const id of selectedIds) if (!carted.has(id)) return true;
		return false;
	});

	function updateCart() {
		cart.clearType('run');
		const items = allRuns
			.filter((r) => selectedIds.has(r.id))
			.map((r) => ({
				type: 'run' as const,
				id: r.id,
				label: r.run_name,
				sublabel: r.platform
			}));
		if (items.length > 0) cart.addMany(items);
		cart.openSidebar();
	}

	const columns = [
		{ key: 'run_name', label: 'Run', sortable: true },
		{ key: 'platform', label: 'Platform', sortable: true },
		{ key: 'instrument_model', label: 'Instrument', sortable: true },
		{ key: 'total_reads', label: 'Reads', sortable: true },
		{ key: 'run_date', label: 'Date', sortable: true },
		{ key: 'people_summary', label: 'People', sortable: true }
	];

	async function deleteRun(row: Record<string, unknown>) {
		if (!confirm(`Delete run "${row.run_name}"?`)) return;
		await fetch(`/api/runs/${row.id}`, { method: 'DELETE' });
		allRuns = allRuns.filter(r => r.id !== row.id);
	}
	async function bulkDeleteRuns(rs: Record<string, unknown>[]) {
		if (!confirm(`Delete ${rs.length} runs?`)) return;
		const ids = rs.map((r) => r.id as string);
		await Promise.all(ids.map((id) => fetch(`/api/runs/${id}`, { method: 'DELETE' })));
		const removed = new Set(ids);
		allRuns = allRuns.filter((r) => !removed.has(r.id));
		selectedIds = new Set([...selectedIds].filter((id) => !removed.has(id)));
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold text-white">Sequencing Runs</h1>
		<div class="flex items-center gap-2">
			{#if selectionChanged}
				<button onclick={updateCart} class="px-3 py-2 border border-ocean-700 text-ocean-400 rounded-lg hover:bg-ocean-900/30 transition-colors text-sm font-medium">
					Update Cart ({selectedIds.size})
				</button>
			{/if}
			<a href="/runs/new" class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">New Run</a>
		</div>
	</div>
	<DataTable
		{columns}
		rows={runs}
		bind:selectedIds
		bind:cartFilterActive={parentFilterActive}
		href={(row) => `/runs/${row.id}`}
		selectable
		empty="No sequencing runs yet."
		showId
		filterable
		cartFilterLabel={hasParentFilter ? `showing ${runs.length}/${allRuns.length} runs` : ''}
		editHref={(row) => `/runs/${row.id}/edit`}
		ondelete={deleteRun}
		onbulkdelete={bulkDeleteRuns}
	/>
</div>
