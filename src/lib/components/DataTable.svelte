<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Column {
		key: string;
		label: string;
		sortable?: boolean;
		class?: string;
	}

	interface Props {
		columns: Column[];
		rows: Record<string, unknown>[];
		href?: (row: Record<string, unknown>) => string;
		empty?: string;
		actions?: Snippet<[Record<string, unknown>]>;
		showId?: boolean;
		editHref?: (row: Record<string, unknown>) => string;
		ondelete?: (row: Record<string, unknown>) => void;
		onduplicate?: (row: Record<string, unknown>) => void;
	}

	let { columns, rows = $bindable(), href, empty = 'No data found.', actions, showId = false, editHref, ondelete, onduplicate }: Props = $props();

	let sortKey = $state('');
	let sortDir = $state<'asc' | 'desc'>('asc');

	function toggleSort(key: string) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDir = 'asc';
		}
	}

	let sortedRows = $derived.by(() => {
		if (!sortKey) return rows;
		return [...rows].sort((a, b) => {
			const av = a[sortKey];
			const bv = b[sortKey];
			if (av == null && bv == null) return 0;
			if (av == null) return 1;
			if (bv == null) return -1;
			const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
			return sortDir === 'asc' ? cmp : -cmp;
		});
	});

	let hasActions = $derived(!!actions || !!editHref || !!ondelete || !!onduplicate);

	function shortId(row: Record<string, unknown>): string {
		const id = row.id as string;
		return id ? id.slice(0, 8) : '';
	}
</script>

<div class="overflow-x-auto rounded-lg border border-slate-800">
	<table class="w-full text-sm">
		<thead>
			<tr class="border-b border-slate-800 bg-slate-900/50">
				{#if showId}
					<th class="px-3 py-3 text-left font-medium text-slate-500 w-20">ID</th>
				{/if}
				{#each columns as col}
					<th class="px-4 py-3 text-left font-medium text-slate-400 {col.class || ''}">
						{#if col.sortable}
							<button
								class="flex items-center gap-1 hover:text-white transition-colors"
								onclick={() => toggleSort(col.key)}
							>
								{col.label}
								{#if sortKey === col.key}
									<span class="text-ocean-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
								{/if}
							</button>
						{:else}
							{col.label}
						{/if}
					</th>
				{/each}
				{#if hasActions}
					<th class="px-4 py-3 text-right font-medium text-slate-400"></th>
				{/if}
			</tr>
		</thead>
		<tbody>
			{#if sortedRows.length === 0}
				<tr>
					<td
						colspan={columns.length + (showId ? 1 : 0) + (hasActions ? 1 : 0)}
						class="px-4 py-8 text-center text-slate-500"
					>
						{empty}
					</td>
				</tr>
			{/if}
			{#each sortedRows as row}
				<tr class="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
					{#if showId}
						<td class="px-3 py-3">
							<span class="font-mono text-xs text-slate-600" title={row.id as string}>{shortId(row)}</span>
						</td>
					{/if}
					{#each columns as col}
						<td class="px-4 py-3 {col.class || ''}">
							{#if href && col === columns[0]}
								<a href={href(row)} class="text-ocean-400 hover:text-ocean-300 hover:underline">
									{row[col.key] ?? '—'}
								</a>
							{:else}
								<span class="text-slate-300">{row[col.key] ?? '—'}</span>
							{/if}
						</td>
					{/each}
					{#if hasActions}
						<td class="px-4 py-3 text-right whitespace-nowrap">
							{#if actions}{@render actions(row)}{/if}
							{#if editHref}<a href={editHref(row)} class="text-xs text-slate-500 hover:text-ocean-400 ml-2">Edit</a>{/if}
							{#if onduplicate}<button onclick={() => onduplicate(row)} class="text-xs text-slate-500 hover:text-ocean-400 ml-2">Dup</button>{/if}
							{#if ondelete}<button onclick={() => ondelete(row)} class="text-xs text-slate-600 hover:text-red-400 ml-2">Del</button>{/if}
						</td>
					{/if}
				</tr>
			{/each}
		</tbody>
	</table>
</div>
