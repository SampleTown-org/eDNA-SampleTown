<script lang="ts">
	import type { Snippet } from 'svelte';
	import { makeRankedHueMap, hueToTableFill, hashHue } from '$lib/color-rank';

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
		/** Bulk-action handlers — fired once with every currently-selected row.
		 *  When provided + ≥2 rows are selected, DataTable shows Delete/Dup
		 *  buttons in the filter bar. Parents supply a single confirm + loop. */
		onbulkdelete?: (rows: Record<string, unknown>[]) => void | Promise<void>;
		onbulkduplicate?: (rows: Record<string, unknown>[]) => void | Promise<void>;
		/** Show the filter input above the table and narrow rows to matching cells. */
		filterable?: boolean;
		/**
		 * Bindable: lets the parent observe which column is currently coloring
		 * the rows. Used by /sites to mirror the color onto map pins.
		 */
		colorByKey?: string;
		/** Enable row-selection checkboxes. */
		selectable?: boolean;
		/** Bindable set of selected row IDs. */
		selectedIds?: Set<string>;
		/**
		 * Optional cart filter label shown inline with the search bar.
		 * E.g. "showing 4/6 sites". Rendered with a filter icon when non-empty.
		 */
		cartFilterLabel?: string;
		/** Bindable: whether the cart filter is currently active. Clicking the
		 *  filter icon toggles this. Parents should use this to gate their
		 *  row-filtering logic. */
		cartFilterActive?: boolean;
	}

	let {
		columns,
		rows = $bindable(),
		href,
		empty = 'No data found.',
		actions,
		showId = false,
		editHref,
		ondelete,
		onduplicate,
		onbulkdelete,
		onbulkduplicate,
		filterable = false,
		colorByKey = $bindable(''),
		selectable = false,
		selectedIds = $bindable(new Set<string>()),
		cartFilterLabel = '',
		cartFilterActive = $bindable(true)
	}: Props = $props();

	let sortKey = $state('');
	let sortDir = $state<'asc' | 'desc'>('asc');
	let searchQuery = $state('');

	function toggleSort(key: string) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDir = 'asc';
		}
	}

	function toggleColorBy(key: string) {
		colorByKey = colorByKey === key ? '' : key;
	}

	function colorForValue(v: unknown): string {
		if (v == null || v === '') return '';
		const s = String(v);
		const hue = colorRankMap?.get(s) ?? hashHue(s);
		return hueToTableFill(hue);
	}

	let filteredRows = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return rows;
		return rows.filter((row) =>
			columns.some((col) => {
				const v = row[col.key];
				return v != null && String(v).toLowerCase().includes(q);
			})
		);
	});

	/** Rows where the sorted column has "no value" always sort to the end,
	 *  regardless of asc/desc direction. Treats null / undefined / empty
	 *  string / whitespace-only as missing so imported blanks behave like
	 *  null even when they're stored as empty strings. */
	function isMissing(v: unknown): boolean {
		if (v == null) return true;
		if (typeof v === 'string' && v.trim() === '') return true;
		return false;
	}
	/** Rank-based hue map for the active color-by column. Values are ranked
	 *  over the currently visible rows, so filtering recomputes the gradient
	 *  and sorting by the same column produces an ordered color ramp. */
	let colorRankMap = $derived(
		colorByKey ? makeRankedHueMap(filteredRows, colorByKey) : null
	);

	let sortedRows = $derived.by(() => {
		if (!sortKey) return filteredRows;
		return [...filteredRows].sort((a, b) => {
			const av = a[sortKey];
			const bv = b[sortKey];
			const aMissing = isMissing(av);
			const bMissing = isMissing(bv);
			if (aMissing && bMissing) return 0;
			if (aMissing) return 1;
			if (bMissing) return -1;
			const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
			return sortDir === 'asc' ? cmp : -cmp;
		});
	});

	let hasActions = $derived(!!actions || !!editHref || !!ondelete || !!onduplicate);

	function shortId(row: Record<string, unknown>): string {
		const id = row.id as string;
		return id ? id.slice(0, 8) : '';
	}

	// Keyboard navigation: shift+up/down to move focus, spacebar to toggle selection
	let focusedIndex = $state(-1);
	let tableEl: HTMLDivElement | undefined = $state();

	function handleKeydown(e: KeyboardEvent) {
		if (!selectable) return;
		const len = sortedRows.length;
		if (len === 0) return;

		if (e.key === 'ArrowDown' && e.shiftKey) {
			e.preventDefault();
			focusedIndex = Math.min(focusedIndex + 1, len - 1);
		} else if (e.key === 'ArrowUp' && e.shiftKey) {
			e.preventDefault();
			focusedIndex = Math.max(focusedIndex - 1, 0);
		} else if (e.key === ' ' && focusedIndex >= 0 && focusedIndex < len) {
			e.preventDefault();
			toggleSelect(sortedRows[focusedIndex].id as string);
		}
	}

	// Selection helpers
	const allVisibleSelected = $derived(
		selectable &&
			sortedRows.length > 0 &&
			sortedRows.every((r) => selectedIds.has(r.id as string))
	);

	function toggleSelectAll() {
		if (allVisibleSelected) {
			const visibleIds = new Set(sortedRows.map((r) => r.id as string));
			selectedIds = new Set([...selectedIds].filter((id) => !visibleIds.has(id)));
		} else {
			const next = new Set(selectedIds);
			for (const r of sortedRows) next.add(r.id as string);
			selectedIds = next;
		}
	}

	function toggleSelect(id: string) {
		const next = new Set(selectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedIds = next;
	}
</script>

{#if filterable}
	<div class="flex items-center gap-3 mb-3">
		<input
			type="text"
			bind:value={searchQuery}
			placeholder="Filter {rows.length} row{rows.length === 1 ? '' : 's'}..."
			class="flex-1 max-w-sm px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500 text-sm"
		/>
		{#if searchQuery}
			<span class="text-xs text-slate-500">{sortedRows.length} of {rows.length}</span>
		{/if}
		{#if cartFilterLabel}
			<button
				onclick={() => (cartFilterActive = !cartFilterActive)}
				class="text-xs flex items-center gap-1 px-2 py-0.5 rounded transition-colors {cartFilterActive ? 'text-ocean-400 hover:text-ocean-300' : 'text-slate-500 hover:text-slate-400'}"
				title="{cartFilterActive ? 'Click to disable' : 'Click to enable'} cart filter"
			>
				<svg class="w-3 h-3" fill={cartFilterActive ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M3 4h18l-7 8v5l-4 2V12L3 4z"/></svg>
				{cartFilterLabel}
			</button>
		{/if}
		{#if colorByKey}
			<button
				onclick={() => (colorByKey = '')}
				class="text-xs text-slate-500 hover:text-ocean-400"
				title="Clear color-by"
			>
				×&nbsp;color by {columns.find((c) => c.key === colorByKey)?.label ?? colorByKey}
			</button>
		{/if}
		{#if selectable}
			<span class="text-[10px] text-slate-600 hidden sm:inline">
				Shift+↑↓ navigate · Space select · Shift+click header to color
			</span>
		{/if}
	</div>
{/if}

<div
	class="overflow-x-auto rounded-lg border border-slate-800"
	bind:this={tableEl}
	tabindex={selectable ? 0 : undefined}
	onkeydown={selectable ? handleKeydown : undefined}
	role={selectable ? 'grid' : undefined}
>
	<table class="w-full text-sm">
		<thead>
			<tr class="border-b border-slate-800 bg-slate-900/50">
				{#if selectable}
					<th class="px-2 py-3 w-8">
						<input
							type="checkbox"
							checked={allVisibleSelected}
							onchange={toggleSelectAll}
							class="accent-ocean-500"
							title={allVisibleSelected ? 'Deselect all visible' : 'Select all visible'}
						/>
					</th>
				{/if}
				{#if hasActions}
					<!-- Bulk actions live in the per-row action column's header so
					     they sit immediately above the per-row Edit/Dup/Del links
					     and right next to the select-all checkbox. Hidden until
					     ≥2 rows are selected + the parent provides the handlers. -->
					<th class="px-2 py-3 text-left font-medium text-slate-400 w-28 whitespace-nowrap">
						{#if selectable && selectedIds.size >= 2 && (onbulkduplicate || onbulkdelete)}
							{@const selectedRows = sortedRows.filter((r) => selectedIds.has(r.id as string))}
							{#if onbulkduplicate}
								<button
									type="button"
									onclick={() => onbulkduplicate!(selectedRows)}
									class="text-xs text-slate-500 hover:text-ocean-400 mr-2"
									title="Duplicate {selectedIds.size} rows"
								>Dup all</button>
							{/if}
							{#if onbulkdelete}
								<button
									type="button"
									onclick={() => onbulkdelete!(selectedRows)}
									class="text-xs text-slate-600 hover:text-red-400"
									title="Delete {selectedIds.size} rows"
								>Del all</button>
							{/if}
						{/if}
					</th>
				{/if}
				{#if showId}
					<th class="px-3 py-3 text-left font-medium text-slate-500 w-20">ID</th>
				{/if}
				{#each columns as col}
					<th
						class="px-4 py-3 text-left font-medium text-slate-400 {col.class || ''}"
						title="Shift+click to color rows by this column"
					>
						<div class="flex items-center gap-2">
							{#if col.sortable}
								<button
									class="flex items-center gap-1 hover:text-white transition-colors"
									onclick={(e) => {
										if (e.shiftKey) toggleColorBy(col.key);
										else toggleSort(col.key);
									}}
								>
									{col.label}
									{#if sortKey === col.key}
										<span class="text-ocean-400">{sortDir === 'asc' ? '↑' : '↓'}</span>
									{/if}
								</button>
							{:else}
								<button
									class="hover:text-white transition-colors"
									onclick={(e) => {
										if (e.shiftKey) toggleColorBy(col.key);
									}}
								>{col.label}</button>
							{/if}
							{#if colorByKey === col.key}
								<span class="text-ocean-400 text-xs" title="Rows colored by this column">●</span>
							{/if}
						</div>
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#if sortedRows.length === 0}
				<tr>
					<td
						colspan={columns.length + (showId ? 1 : 0) + (hasActions ? 1 : 0) + (selectable ? 1 : 0)}
						class="px-4 py-8 text-center text-slate-500"
					>
						{empty}
					</td>
				</tr>
			{/if}
			{#each sortedRows as row, rowIdx}
				<tr
					class="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors {selectable && selectedIds.has(row.id as string) ? 'bg-ocean-900/20' : ''} {selectable && focusedIndex === rowIdx ? 'outline outline-1 outline-ocean-500 -outline-offset-1' : ''}"
					style={colorByKey ? colorForValue(row[colorByKey]) : ''}
					onclick={() => { if (selectable) focusedIndex = rowIdx; }}
				>
					{#if selectable}
						<td class="px-2 py-3">
							<input
								type="checkbox"
								checked={selectedIds.has(row.id as string)}
								onchange={() => toggleSelect(row.id as string)}
								class="accent-ocean-500"
							/>
						</td>
					{/if}
					{#if hasActions}
						<td class="px-2 py-3 whitespace-nowrap">
							{#if actions}{@render actions(row)}{/if}
							{#if editHref}<a href={editHref(row)} class="text-xs text-slate-500 hover:text-ocean-400 mr-2">Edit</a>{/if}
							{#if onduplicate}<button onclick={() => onduplicate(row)} class="text-xs text-slate-500 hover:text-ocean-400 mr-2">Dup</button>{/if}
							{#if ondelete}<button onclick={() => ondelete(row)} class="text-xs text-slate-600 hover:text-red-400">Del</button>{/if}
						</td>
					{/if}
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
				</tr>
			{/each}
		</tbody>
	</table>
</div>
