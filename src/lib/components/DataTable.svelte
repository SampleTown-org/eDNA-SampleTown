<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { makeRankedHueMap, hashHue } from '$lib/color-rank';

	interface Column {
		key: string;
		label: string;
		sortable?: boolean;
		class?: string;
		/** Makes this column's cells links. Returning null leaves the cell as
		 *  plain text, so a column of files can hold rows that have none. The
		 *  cell keeps showing `row[key]`, so sorting and filtering still work
		 *  on the value rather than on the target. */
		href?: (row: Record<string, unknown>) => string | null;
		/** Open this column's links in a new tab — for targets outside the app,
		 *  such as an archive's download URL. */
		external?: boolean;
	}

	interface Props {
		columns: Column[];
		rows: Record<string, unknown>[];
		href?: (row: Record<string, unknown>) => string;
		/** Shown when there is genuinely nothing to list. A table emptied by a
		 *  filter says that instead, so this should not mention filtering. */
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
		filterActions?: Snippet;
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
		cartFilterActive = $bindable(true),
		filterActions
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

	/** Raw background color for a row (no `background-color:` prefix), or null
	 *  when color-by is off / the value is missing. Used by both the <tr>
	 *  inline style and the `--row-bg` CSS variable that feeds sticky cells. */
	function rowBgColor(v: unknown): string | null {
		if (v == null || v === '') return null;
		const s = String(v);
		const hue = colorRankMap?.get(s) ?? hashHue(s);
		return `hsl(${hue}, 30%, 22%)`;
	}

	/** Inline style for a <tr>: tints the whole row when color-by is on,
	 *  otherwise leaves the bg to class-based hover/selected styling. */
	function rowStyle(row: Record<string, unknown>): string {
		const bg = colorByKey ? rowBgColor(row[colorByKey]) : null;
		return bg ? `background-color: ${bg};` : '';
	}

	/** Solid opaque background for a sticky left cell. Needed because sticky
	 *  cells sit over horizontally-scrolling siblings — without an explicit
	 *  fill, the right-side cells bleed through. Matches the row's color-by
	 *  tint when active so the gradient still reads across the whole row. */
	function stickyBg(row: Record<string, unknown>): string {
		const bg = colorByKey ? rowBgColor(row[colorByKey]) : null;
		return bg ?? 'rgb(2, 6, 23)'; // slate-950
	}

	// Viewer role hides every `.write-only` cell via global CSS, but those
	// cells' pixel widths still need to be excluded from the sticky-left
	// offsets — otherwise the first data column sticks at left=224px while
	// nothing renders at x=0..224, leaving a gap between the pinned column
	// and the rest of the row.
	const isViewer = $derived(page.data.user?.role === 'viewer');

	/** Left-offset (px) for each sticky column. Only the columns that actually
	 *  render are allocated an offset, so tables that don't use selection or
	 *  actions still line up correctly. */
	const stickyOffsets = $derived.by(() => {
		let x = 0;
		const o = { checkbox: 0, actions: 0, id: 0, firstCol: 0 };
		if (selectable && !isViewer) { o.checkbox = x; x += 32; }
		if (hasActions && !isViewer) { o.actions = x; x += 112; }
		if (showId && !isViewer) { o.id = x; x += 120; }
		o.firstCol = x;
		return o;
	});

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

	/**
	 * The row's identity as a person would cite it: its INSDC accession when
	 * the record came from an archive, otherwise the leading bytes of the
	 * internal id. Records entered by hand have never been submitted anywhere
	 * and have no accession to show.
	 */
	function rowIdentity(row: Record<string, unknown>): string {
		const accession = row.accession as string | null | undefined;
		if (accession && String(accession).trim()) return String(accession).trim();
		const id = row.id as string;
		return id ? id.slice(0, 8) : '';
	}

	/** True once any row carries an accession — retitles the column. */
	const hasAccessions = $derived(
		rows.some((r) => {
			const a = (r as Record<string, unknown>).accession;
			return a != null && String(a).trim() !== '';
		})
	);

	let tableEl: HTMLDivElement | undefined = $state();

	// --- Horizontal scroll -------------------------------------------------
	//
	// These tables are wider than the viewport by design: MIxS gives every
	// sample dozens of optional parameters. A scrollbar only at the bottom of a
	// long table is off-screen exactly when the reader is looking at the top
	// rows, so a second one is mirrored above the header, and the right edge is
	// faded while there is more to reach.
	let topScrollEl: HTMLDivElement | undefined = $state();
	let scrollWidth = $state(0);
	let viewportWidth = $state(0);
	let scrollLeft = $state(0);

	const hasOverflow = $derived(scrollWidth - viewportWidth > 1);
	const moreToTheRight = $derived(hasOverflow && scrollLeft + viewportWidth < scrollWidth - 1);

	/**
	 * Mirror one scroller onto the other and record the position.
	 *
	 * The echo stops itself: assigning scrollLeft fires the other element's
	 * scroll event, which finds the two already equal and assigns nothing.
	 * Every event must be handled — suppressing them on a timer drops the last
	 * one of a fast trackpad scroll and leaves the recorded position stale,
	 * with the "more" marker showing at the right edge.
	 */
	function syncScroll(from: 'top' | 'table') {
		const source = from === 'top' ? topScrollEl : tableEl;
		const target = from === 'top' ? tableEl : topScrollEl;
		if (!source) return;
		scrollLeft = source.scrollLeft;
		if (target && Math.abs(target.scrollLeft - source.scrollLeft) > 0.5) {
			target.scrollLeft = source.scrollLeft;
		}
	}

	/** Track the table's dimensions so the proxy scrollbar matches its width
	 *  and the fade knows whether there is anything left to scroll to. */
	$effect(() => {
		if (!tableEl) return;
		// Touch the rows so this re-runs when the table's contents change.
		sortedRows.length;
		columns.length;

		const measure = () => {
			if (!tableEl) return;
			scrollWidth = tableEl.scrollWidth;
			viewportWidth = tableEl.clientWidth;
			scrollLeft = tableEl.scrollLeft;
		};
		measure();

		const observer = new ResizeObserver(measure);
		observer.observe(tableEl);
		return () => observer.disconnect();
	});

	// Keyboard navigation: shift+up/down to move focus, spacebar to toggle selection
	let focusedIndex = $state(-1);

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
		{#if filterActions}
			<div class="ml-auto flex items-center gap-2">
				{@render filterActions()}
			</div>
		{/if}
	</div>
{/if}

<div>
	<!-- Proxy scrollbar above the header, kept in step with the table below.
	     Only rendered when the table actually overflows. Sits outside the
	     wrapper that carries the edge fade so the fade cannot cover it. -->
	{#if hasOverflow}
		<div
			bind:this={topScrollEl}
			onscroll={() => syncScroll('top')}
			class="table-hscroll overflow-x-scroll overflow-y-hidden mb-1"
			aria-hidden="true"
		>
			<div style="width: {scrollWidth}px; height: 1px;"></div>
		</div>
	{/if}

<div class="relative">
<div
	class="overflow-x-auto rounded-lg border border-slate-800"
	bind:this={tableEl}
	onscroll={() => syncScroll('table')}
	tabindex={selectable ? 0 : undefined}
	onkeydown={selectable ? handleKeydown : undefined}
	role={selectable ? 'grid' : undefined}
>
	<table class="w-full text-sm" style="border-collapse: separate; border-spacing: 0;">
		<thead>
			<tr class="border-b border-slate-800 bg-slate-900/50">
				{#if selectable}
					<th
						class="hidden sm:table-cell write-only px-2 py-3 sm:sticky sm:z-20 bg-slate-900"
						style="left: {stickyOffsets.checkbox}px; width: 32px; min-width: 32px; max-width: 32px;"
					>
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
					<th
						class="hidden sm:table-cell write-only px-2 py-3 text-left font-medium text-slate-400 whitespace-nowrap sm:sticky sm:z-20 bg-slate-900"
						style="left: {stickyOffsets.actions}px; width: 112px; min-width: 112px; max-width: 112px;"
					>
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
					<th
						class="hidden sm:table-cell write-only px-3 py-3 text-left font-medium text-slate-500 sm:sticky sm:z-20 bg-slate-900"
						style="left: {stickyOffsets.id}px; width: 120px; min-width: 120px; max-width: 120px;"
					>{hasAccessions ? 'Accession' : 'ID'}</th>
				{/if}
				{#each columns as col, colIdx}
					<th
						class="px-4 py-3 text-left font-medium text-slate-400 {col.class || ''} {colIdx === 0 ? 'sm:sticky sm:z-20 bg-slate-900 max-w-56' : ''}"
						style={colIdx === 0 ? `left: ${stickyOffsets.firstCol}px;` : ''}
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
						{#if searchQuery && rows.length > 0}
							Nothing matches “{searchQuery}”.
							<button
								type="button"
								onclick={() => (searchQuery = '')}
								class="text-ocean-400 hover:text-ocean-300 underline"
							>Clear the filter</button>
						{:else}
							{empty}
						{/if}
					</td>
				</tr>
			{/if}
			{#each sortedRows as row, rowIdx}
				<tr
					class="hover:bg-slate-800/30 transition-colors {selectable && selectedIds.has(row.id as string) ? 'bg-ocean-900/20' : ''}"
					class:row-focused={selectable && focusedIndex === rowIdx}
					style={rowStyle(row)}
					onclick={() => { if (selectable) focusedIndex = rowIdx; }}
				>
					{#if selectable}
						<td class="hidden sm:table-cell write-only px-2 py-3 sm:sticky sm:z-10" style="left: {stickyOffsets.checkbox}px; width: 32px; min-width: 32px; max-width: 32px; background-color: {stickyBg(row)};">
							<input
								type="checkbox"
								checked={selectedIds.has(row.id as string)}
								onchange={() => toggleSelect(row.id as string)}
								class="accent-ocean-500"
							/>
						</td>
					{/if}
					{#if hasActions}
						<td class="hidden sm:table-cell write-only px-2 py-3 whitespace-nowrap sm:sticky sm:z-10" style="left: {stickyOffsets.actions}px; width: 112px; min-width: 112px; max-width: 112px; background-color: {stickyBg(row)};">
							{#if actions}{@render actions(row)}{/if}
							{#if editHref}<a href={editHref(row)} class="text-xs text-slate-500 hover:text-ocean-400 mr-2">Edit</a>{/if}
							{#if onduplicate}<button onclick={() => onduplicate(row)} class="text-xs text-slate-500 hover:text-ocean-400 mr-2">Dup</button>{/if}
							{#if ondelete}<button onclick={() => ondelete(row)} class="text-xs text-slate-600 hover:text-red-400">Del</button>{/if}
						</td>
					{/if}
					{#if showId}
						<td class="hidden sm:table-cell write-only px-3 py-3 sm:sticky sm:z-10" style="left: {stickyOffsets.id}px; width: 120px; min-width: 120px; max-width: 120px; background-color: {stickyBg(row)};">
							<span
								class="font-mono text-xs {row.accession ? 'text-slate-400' : 'text-slate-600'}"
								title={row.id as string}
							>{rowIdentity(row)}</span>
						</td>
					{/if}
					{#each columns as col, colIdx}
						<!-- The first column is sticky, so it cannot be allowed to size
						     itself to its content: one long name would push every other
						     column off-screen and pin it there. Wrap instead. -->
						<td
							class="px-4 py-3 {col.class || ''} {colIdx === 0 ? 'sm:sticky sm:z-10 max-w-56 break-words' : ''}"
							style={colIdx === 0 ? `left: ${stickyOffsets.firstCol}px; background-color: ${stickyBg(row)};` : ''}
						>
							{#if col.href && col.href(row)}
								<a
									href={col.href(row)}
									target={col.external ? '_blank' : null}
									rel={col.external ? 'noopener noreferrer' : null}
									class="text-ocean-400 hover:text-ocean-300 hover:underline"
								>{row[col.key] ?? '—'}{col.external ? ' ↗' : ''}</a>
							{:else if href && col === columns[0]}
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

	<!-- Right-edge affordance: the columns run past the viewport far more often
	     than not, and without this the table looks like it simply ends. The
	     label sits level with the header rather than centred, which on a long
	     table would put it hundreds of pixels down the page. -->
	{#if moreToTheRight}
		<div
			class="pointer-events-none absolute right-0 top-0 bottom-0 w-16 rounded-r-lg
			       bg-gradient-to-l from-slate-950 via-slate-950/80 to-transparent"
			aria-hidden="true"
		></div>
		<span
			class="pointer-events-none absolute right-2 top-3 text-xs font-medium text-slate-400"
			aria-hidden="true"
		>more →</span>
	{/if}
</div>
</div>

<style>
	/* border-collapse: separate on the table (needed for sticky td in all
	   browsers) means borders have to live on the cells, not on the row. */
	thead tr th { border-bottom: 1px solid rgb(30, 41, 59); } /* slate-800 */
	tbody tr td { border-bottom: 1px solid rgba(30, 41, 59, 0.5); }
	/* Focused-row highlight: inset top/bottom box-shadow on every cell so
	   the blue line reads as continuous across the sticky / scrolling
	   boundary (an `outline` on the <tr> is occluded by sticky cells). */
	tbody tr.row-focused td {
		box-shadow: inset 0 1px 0 0 rgb(14, 165, 233), inset 0 -1px 0 0 rgb(14, 165, 233);
	}
	/*
	 * The proxy scrollbar is the control, not a hint, so it is drawn at a size
	 * worth aiming at and never fades. Overlay scrollbars — the platform default
	 * on macOS and on mobile — hide until scrolled and thin out again after, and
	 * some grow on hover, which moves the target while it is being aimed at.
	 */
	.table-hscroll {
		scrollbar-width: auto;
		scrollbar-color: rgb(71 85 105) rgb(15 23 42); /* slate-600 on slate-900 */
	}

	.table-hscroll::-webkit-scrollbar {
		-webkit-appearance: none;
		height: 16px;
	}

	.table-hscroll::-webkit-scrollbar-track {
		background: rgb(15 23 42);
		border-radius: 8px;
	}

	.table-hscroll::-webkit-scrollbar-thumb {
		background: rgb(71 85 105);
		border-radius: 8px;
		/* Inset the thumb with a transparent border rather than by shrinking it,
		   so its hit area stays the full height of the bar. */
		border: 3px solid rgb(15 23 42);
		background-clip: padding-box;
	}

	.table-hscroll::-webkit-scrollbar-thumb:hover {
		background: rgb(100 116 139); /* slate-500 — colour only, same geometry */
		border: 3px solid rgb(15 23 42);
		background-clip: padding-box;
	}
</style>
