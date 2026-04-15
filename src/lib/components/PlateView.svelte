<script lang="ts">
	/**
	 * A plate-layout grid for assigning items (extracts, PCR reactions, etc.)
	 * to wells. Supports 8, 96, and 384 well formats.
	 *
	 * Drag-and-drop:
	 *   - Drag an unassigned item from the sidebar onto any empty well to place it.
	 *   - Drag a placed item from one well to another to move it.
	 *   - Click an ✕ on a placed well to clear it (item returns to the sidebar).
	 *
	 * The parent owns:
	 *   - `unassigned` : array of items not yet placed in wells
	 *   - `wellAssignments` : Record<wellLabel, itemId> — the current layout
	 *
	 * Both are bound so the parent can read them on submit.
	 *
	 * Well labels are the standard {A..H}{1..12} / {A..P}{1..24} format.
	 */

	type Item = { id: string; label: string; sublabel?: string };

	interface Props {
		items: Item[];
		/** wellLabel → item.id. Unassigned items are those not present in any well. */
		wellAssignments: Record<string, string>;
		format?: 8 | 96 | 384;
	}

	let {
		items,
		wellAssignments = $bindable(),
		format = $bindable(96)
	}: Props = $props();

	// --- Grid geometry ----------------------------------------------------
	const LAYOUTS = {
		8: { rows: 1, cols: 8 },
		96: { rows: 8, cols: 12 },
		384: { rows: 16, cols: 24 }
	};
	const ROW_LETTERS = 'ABCDEFGHIJKLMNOP';

	const layout = $derived(LAYOUTS[format]);
	const rowLabels = $derived(ROW_LETTERS.slice(0, layout.rows).split(''));
	const colLabels = $derived(Array.from({ length: layout.cols }, (_, i) => i + 1));

	function wellLabel(rowIdx: number, colIdx: number): string {
		// 0-padded column so labels lex-sort correctly (A01, A02, ..., A12)
		// instead of A1, A10, A11, A12, A2, ... — matches the convention
		// SRA / Illumina sample-sheets and most plate-management tools use.
		const col = String(colIdx + 1).padStart(2, '0');
		return `${ROW_LETTERS[rowIdx]}${col}`;
	}

	// --- Item lookup ------------------------------------------------------
	const itemsById = $derived(new Map(items.map((i) => [i.id, i])));

	/** Items not currently assigned to any well. */
	const unassignedItems = $derived(
		items.filter((i) => !Object.values(wellAssignments).includes(i.id))
	);

	// --- Drag & drop ------------------------------------------------------
	let draggingItemId = $state<string | null>(null);
	let draggingFromWell = $state<string | null>(null);

	function onDragStartUnassigned(e: DragEvent, itemId: string) {
		draggingItemId = itemId;
		draggingFromWell = null;
		e.dataTransfer?.setData('text/plain', itemId);
		e.dataTransfer!.effectAllowed = 'move';
	}

	function onDragStartWell(e: DragEvent, well: string) {
		const itemId = wellAssignments[well];
		if (!itemId) return;
		draggingItemId = itemId;
		draggingFromWell = well;
		e.dataTransfer?.setData('text/plain', itemId);
		e.dataTransfer!.effectAllowed = 'move';
	}

	function onDragOver(e: DragEvent) {
		e.preventDefault();
		e.dataTransfer!.dropEffect = 'move';
	}

	function onDropWell(e: DragEvent, well: string) {
		e.preventDefault();
		const itemId = draggingItemId ?? e.dataTransfer?.getData('text/plain');
		if (!itemId) return;

		const existing = wellAssignments[well];
		const next = { ...wellAssignments };

		if (draggingFromWell) {
			// Move from one well to another — swap if destination was occupied.
			delete next[draggingFromWell];
			if (existing && existing !== itemId) {
				next[draggingFromWell] = existing;
			}
		} else if (existing) {
			// Dropped onto an occupied well from the sidebar → ignore.
			draggingItemId = null;
			draggingFromWell = null;
			return;
		}

		next[well] = itemId;
		wellAssignments = next;
		draggingItemId = null;
		draggingFromWell = null;
	}

	function clearWell(well: string) {
		const next = { ...wellAssignments };
		delete next[well];
		wellAssignments = next;
	}

	/** Auto-place unassigned items column-by-column starting at A1. */
	function autoFill() {
		const occupied = new Set(Object.keys(wellAssignments));
		const next = { ...wellAssignments };
		const queue = [...unassignedItems];
		for (let c = 0; c < layout.cols && queue.length > 0; c++) {
			for (let r = 0; r < layout.rows && queue.length > 0; r++) {
				const w = wellLabel(r, c);
				if (occupied.has(w)) continue;
				const item = queue.shift();
				if (item) next[w] = item.id;
			}
		}
		wellAssignments = next;
	}

	function clearAll() {
		wellAssignments = {};
	}

	// Cell size shrinks for 384-well; also used for font sizing.
	const cellClass = $derived(
		format === 8
			? 'w-20 h-14 text-xs'
			: format === 96
				? 'w-12 h-10 text-[10px]'
				: 'w-7 h-7 text-[8px]'
	);
</script>

<div class="space-y-3">
	<div class="flex items-center justify-between flex-wrap gap-2">
		<div class="flex items-center gap-2">
			<span class="text-xs text-slate-400">Format:</span>
			<div class="flex gap-1 p-1 bg-slate-800 rounded">
				{#each [8, 96, 384] as f}
					<button
						type="button"
						onclick={() => (format = f as 8 | 96 | 384)}
						class="px-2 py-0.5 rounded text-xs {format === f
							? 'bg-ocean-600 text-white'
							: 'text-slate-400 hover:text-white'}"
					>
						{f}
					</button>
				{/each}
			</div>
			<span class="text-xs text-slate-500 ml-2">
				{Object.keys(wellAssignments).length} / {layout.rows * layout.cols} wells
			</span>
		</div>
		<div class="flex gap-2 text-xs">
			<button
				type="button"
				onclick={autoFill}
				disabled={unassignedItems.length === 0}
				class="px-2 py-1 border border-slate-700 text-slate-300 rounded hover:bg-slate-800 disabled:opacity-50"
			>
				Auto-fill
			</button>
			<button
				type="button"
				onclick={clearAll}
				disabled={Object.keys(wellAssignments).length === 0}
				class="px-2 py-1 border border-slate-700 text-slate-500 rounded hover:text-red-400 hover:border-red-900 disabled:opacity-50"
			>
				Clear all
			</button>
		</div>
	</div>

	<div class="grid grid-cols-[auto_1fr] gap-4">
		<!-- Unassigned sidebar -->
		<div class="w-48 max-h-[28rem] overflow-y-auto rounded-lg border border-slate-800 bg-slate-900/50 p-2 space-y-1">
			<p class="text-xs text-slate-500 px-1 pb-1 border-b border-slate-800">
				Unassigned ({unassignedItems.length})
			</p>
			{#each unassignedItems as item}
				<div
					draggable="true"
					ondragstart={(e) => onDragStartUnassigned(e, item.id)}
					class="p-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 cursor-grab active:cursor-grabbing text-xs"
				>
					<div class="text-white truncate">{item.label}</div>
					{#if item.sublabel}
						<div class="text-slate-500 truncate">{item.sublabel}</div>
					{/if}
				</div>
			{/each}
			{#if unassignedItems.length === 0}
				<p class="text-xs text-slate-600 px-1 pt-2">All placed.</p>
			{/if}
		</div>

		<!-- Plate grid -->
		<div class="overflow-x-auto">
			<table class="border-separate border-spacing-0.5">
				<thead>
					<tr>
						<th class="w-6"></th>
						{#each colLabels as c}
							<th class="text-[9px] text-slate-600 font-normal text-center {cellClass.split(' ')[0]}">{c}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each rowLabels as rowLetter, ri}
						<tr>
							<td class="text-[9px] text-slate-600 text-right pr-1 font-medium">{rowLetter}</td>
							{#each colLabels as _, ci}
								{@const w = wellLabel(ri, ci)}
								{@const itemId = wellAssignments[w]}
								{@const item = itemId ? itemsById.get(itemId) : null}
								<td
									class="{cellClass} border border-slate-800/80 rounded {item
										? 'bg-ocean-900/60 border-ocean-700'
										: 'bg-slate-900/40'} text-center align-middle relative group"
									ondragover={onDragOver}
									ondrop={(e) => onDropWell(e, w)}
									title={item ? `${w}: ${item.label}${item.sublabel ? ' — ' + item.sublabel : ''}` : w}
								>
									{#if item}
										<div
											draggable="true"
											ondragstart={(e) => onDragStartWell(e, w)}
											class="w-full h-full cursor-grab active:cursor-grabbing flex items-center justify-center overflow-hidden text-white"
										>
											<span class="truncate px-0.5">{item.label}</span>
										</div>
										<button
											type="button"
											onclick={() => clearWell(w)}
											class="absolute top-0 right-0 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 text-xs leading-none px-0.5"
											title="Clear well"
										>×</button>
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>
