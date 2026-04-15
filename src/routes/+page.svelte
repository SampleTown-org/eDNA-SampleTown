<script lang="ts">
	import { cart, type CartEntityType } from '$lib/stores/cart.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const cards = [
		{ href: '/projects',  label: 'Projects',       count: data.counts.projects },
		{ href: '/sites',     label: 'Sites',          count: data.counts.sites },
		{ href: '/samples',   label: 'Samples',        count: data.counts.samples },
		{ href: '/extracts',  label: 'Extracts',       count: data.counts.extracts },
		{ href: '/pcr',       label: 'PCR Plates',     count: data.counts.pcrPlates },
		{ href: '/libraries', label: 'Library Plates', count: data.counts.libraryPlates },
		{ href: '/runs',      label: 'Sequencing Runs',count: data.counts.runs },
		{ href: '/analysis',  label: 'Analyses',       count: data.counts.analyses }
	];

	// --- Event calendar ---------------------------------------------------
	const EVENT_COLORS: Record<string, { dot: string; label: string }> = {
		site:          { dot: 'bg-sky-400',     label: 'Site' },
		sample:        { dot: 'bg-ocean-400',   label: 'Sample collection' },
		extract:       { dot: 'bg-emerald-400', label: 'Extraction' },
		pcr_plate:     { dot: 'bg-amber-400',   label: 'PCR plate' },
		library_plate: { dot: 'bg-violet-400',  label: 'Library prep' },
		run:           { dot: 'bg-rose-400',    label: 'Sequencing run' }
	};
	// Backward compat for the calendar aggregates which use short type names
	const CAL_TYPE_MAP: Record<string, string> = {
		pcr: 'pcr_plate', library: 'library_plate'
	};

	const eventsByDate = $derived.by(() => {
		const map = new Map<string, { type: string; count: number }[]>();
		for (const e of data.events) {
			if (!e.date) continue;
			const type = CAL_TYPE_MAP[e.type] ?? e.type;
			const arr = map.get(e.date) ?? [];
			arr.push({ type, count: e.count });
			map.set(e.date, arr);
		}
		return map;
	});

	const years = $derived.by(() => {
		const set = new Set<number>();
		for (const e of data.events) {
			if (e.date) set.add(Number(e.date.slice(0, 4)));
		}
		set.add(new Date().getFullYear());
		return Array.from(set).sort((a, b) => a - b);
	});

	let selectedYear = $state(new Date().getFullYear());

	const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	function daysInMonth(year: number, month: number): number {
		return new Date(year, month + 1, 0).getDate();
	}
	function isoDate(year: number, month: number, day: number): string {
		return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
	}

	// --- Calendar ↔ activity list interaction ---
	let selectedDates = $state<Set<string>>(new Set());

	function onDayClick(dateKey: string, e: MouseEvent) {
		if (e.shiftKey) {
			// Multi-select: toggle this date
			const next = new Set(selectedDates);
			if (next.has(dateKey)) next.delete(dateKey);
			else next.add(dateKey);
			selectedDates = next;
		} else {
			// Single click: select only this date (or deselect if already sole selection)
			if (selectedDates.size === 1 && selectedDates.has(dateKey)) {
				selectedDates = new Set();
			} else {
				selectedDates = new Set([dateKey]);
			}
		}
	}

	// --- Activity list ---
	const TYPE_HREF: Record<string, (id: string) => string> = {
		site: (id) => `/sites/${id}`,
		sample: (id) => `/samples/${id}`,
		extract: (id) => `/extracts/${id}`,
		pcr_plate: (id) => `/pcr/${id}`,
		library_plate: (id) => `/libraries/${id}`,
		run: (id) => `/runs/${id}`
	};
	const TYPE_LABEL: Record<string, string> = {
		site: 'Site', sample: 'Sample', extract: 'Extract', pcr_plate: 'PCR Plate',
		library_plate: 'Library Plate', run: 'Run'
	};

	// Sort control — supports sorting by any column
	let sortKey = $state<'date' | 'type' | 'name' | 'detail' | 'updated_at'>('updated_at');
	let sortDir = $state<'asc' | 'desc'>('desc');

	function toggleSort(key: typeof sortKey) {
		if (sortKey === key) {
			sortDir = sortDir === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDir = key === 'date' ? 'desc' : 'asc';
		}
	}

	// Free-text search — matches against name, detail, type, username,
	// date, and both short + full entity id so a scanned id narrows
	// the list. The `#dashboard-search` hash lets the navbar magnifier
	// deep-link straight to this field.
	let searchQuery = $state('');
	let searchInputEl: HTMLInputElement | undefined;

	$effect(() => {
		if (typeof window === 'undefined') return;
		if (window.location.hash === '#dashboard-search' && searchInputEl) {
			searchInputEl.focus();
		}
	});

	// Filtered + sorted activities
	let filteredActivities = $derived.by(() => {
		let result = data.activities as typeof data.activities;
		if (selectedDates.size > 0) {
			result = result.filter((a) => selectedDates.has(a.date));
		}
		const q = searchQuery.trim().toLowerCase();
		if (q) {
			result = result.filter((a) => {
				const bag = [
					a.id, a.id?.slice(0, 8),
					a.name, a.detail,
					TYPE_LABEL[a.type] ?? a.type,
					a.date, a.updated_at,
					a.created_by_username ? '@' + a.created_by_username : ''
				].filter(Boolean).join(' ').toLowerCase();
				return bag.includes(q);
			});
		}
		// Nulls / empty-string cells always go to the end regardless of direction.
		const sorted = [...result].sort((a, b) => {
			const av = (a as any)[sortKey];
			const bv = (b as any)[sortKey];
			const aMissing = av == null || av === '';
			const bMissing = bv == null || bv === '';
			if (aMissing && bMissing) return 0;
			if (aMissing) return 1;
			if (bMissing) return -1;
			if (av < bv) return sortDir === 'asc' ? -1 : 1;
			if (av > bv) return sortDir === 'asc' ? 1 : -1;
			return 0;
		});
		return sorted;
	});

	// Pagination
	const PAGE_SIZE = 50;
	let currentPage = $state(0);
	const totalPages = $derived(Math.max(1, Math.ceil(filteredActivities.length / PAGE_SIZE)));
	const pagedActivities = $derived(
		filteredActivities.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
	);

	// Reset page when filter changes
	$effect(() => {
		filteredActivities; // touch to subscribe
		currentPage = 0;
	});

	// Cart integration
	let selectedIds = $state<Set<string>>(new Set());

	const allPageSelected = $derived(
		pagedActivities.length > 0 && pagedActivities.every((a) => selectedIds.has(a.id))
	);

	function toggleSelectAll() {
		if (allPageSelected) {
			const pageIds = new Set(pagedActivities.map((a) => a.id));
			selectedIds = new Set([...selectedIds].filter((id) => !pageIds.has(id)));
		} else {
			const next = new Set(selectedIds);
			for (const a of pagedActivities) next.add(a.id);
			selectedIds = next;
		}
	}

	function toggleActivity(id: string) {
		const next = new Set(selectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedIds = next;
	}

	function addSelectedToCart() {
		const items = data.activities
			.filter((a) => selectedIds.has(a.id))
			.map((a) => ({
				type: a.type as CartEntityType,
				id: a.id,
				label: a.name,
				sublabel: a.detail || undefined
			}));
		cart.addMany(items);
		cart.openSidebar();
		selectedIds = new Set();
	}
</script>

<div class="space-y-8">
	<div>
		<h1 class="text-3xl font-bold text-white tracking-tight">
			{data.lab?.name ?? 'SampleTown'}
		</h1>
		<p class="text-slate-400 mt-1 text-sm">
			eDNA sample tracking &middot; MIxS-compliant
			{#if data.lab}<span class="text-slate-600"> &middot; lab/{data.lab.slug}</span>{/if}
		</p>
	</div>

	<div class="grid grid-cols-4 sm:grid-cols-8 gap-2">
		{#each cards as card}
			<a
				href={card.href}
				class="block p-3 rounded-lg border border-slate-800 bg-slate-900/50 hover:border-ocean-700 transition-colors"
			>
				<div class="text-xl font-bold text-ocean-400 leading-tight">{card.count}</div>
				<div class="text-xs text-slate-400 mt-0.5 truncate">{card.label}</div>
			</a>
		{/each}
	</div>

	<!-- Year calendar of events -->
	<div class="space-y-3">
		<div class="flex items-center justify-between">
			<h2 class="text-lg font-semibold text-white">Activity calendar</h2>
			<div class="flex items-center gap-3">
				{#if selectedDates.size > 0}
					<button
						onclick={() => (selectedDates = new Set())}
						class="text-xs text-slate-500 hover:text-ocean-400"
					>Clear {selectedDates.size} date{selectedDates.size === 1 ? '' : 's'}</button>
				{/if}
				<div class="flex gap-1">
					{#each years as y}
						<button
							onclick={() => (selectedYear = y)}
							class="px-2 py-1 rounded text-sm transition-colors {selectedYear === y ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}"
						>{y}</button>
					{/each}
				</div>
			</div>
		</div>

		<div class="rounded-lg border border-slate-800 bg-slate-900/50 p-4 overflow-x-auto">
			<table class="border-separate border-spacing-0.5">
				<thead>
					<tr>
						<th class="w-10"></th>
						{#each Array.from({ length: 31 }, (_, i) => i + 1) as d}
							<th class="text-[9px] text-slate-600 font-normal w-5 text-center">
								{d % 5 === 0 || d === 1 ? d : ''}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each MONTHS as month, mi}
						<tr>
							<td class="pr-2 text-xs text-slate-500 text-right font-medium">{month}</td>
							{#each Array.from({ length: 31 }, (_, i) => i + 1) as day}
								{#if day <= daysInMonth(selectedYear, mi)}
									{@const dateKey = isoDate(selectedYear, mi, day)}
									{@const dayEvents = eventsByDate.get(dateKey) ?? []}
									{@const isSelected = selectedDates.has(dateKey)}
									<td
										class="w-5 h-5 border cursor-pointer transition-colors
											{isSelected
												? 'border-ocean-500 bg-ocean-900/60'
												: dayEvents.length > 0
													? 'border-slate-800/60 bg-slate-800/80 hover:border-ocean-700'
													: 'border-slate-800/60 bg-slate-900/40 hover:border-slate-700'}"
										title={dayEvents.length > 0
											? `${dateKey}\n` + dayEvents.map((e) => `${EVENT_COLORS[e.type]?.label ?? e.type}: ${e.count}`).join('\n')
											: dateKey}
										onclick={(e) => onDayClick(dateKey, e)}
									>
										{#if dayEvents.length > 0}
											<div class="flex flex-wrap gap-0.5 items-center justify-center h-full w-full p-0.5">
												{#each dayEvents as e}
													<span class="w-1 h-1 rounded-full {EVENT_COLORS[e.type]?.dot ?? 'bg-slate-400'}"></span>
												{/each}
											</div>
										{/if}
									</td>
								{:else}
									<td class="w-5 h-5"></td>
								{/if}
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>

			<div class="flex flex-wrap gap-4 mt-4 pt-3 border-t border-slate-800 text-xs">
				{#each Object.entries(EVENT_COLORS) as [key, cfg]}
					<div class="flex items-center gap-1.5">
						<span class="w-2 h-2 rounded-full {cfg.dot}"></span>
						<span class="text-slate-400">{cfg.label}</span>
					</div>
				{/each}
				<span class="text-slate-600 ml-auto">Click date to filter list · Shift+click to multi-select</span>
			</div>
		</div>
	</div>

	<!-- Activity list -->
	<div class="space-y-3">
		<div class="flex items-center justify-between gap-3 flex-wrap">
			<h2 class="text-lg font-semibold text-white">
				Activities
				<span class="text-sm font-normal text-slate-500">
					({filteredActivities.length}{selectedDates.size > 0 || searchQuery ? ` of ${data.activities.length}` : ''})
				</span>
			</h2>
			<input
				id="dashboard-search"
				bind:this={searchInputEl}
				type="text"
				bind:value={searchQuery}
				placeholder="Search name, type, ID…"
				class="flex-1 min-w-0 sm:max-w-xs px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500 text-sm scroll-mt-24"
			/>
			<div class="flex items-center gap-2">
				{#if selectedIds.size > 0}
					<button
						onclick={addSelectedToCart}
						class="px-3 py-1.5 border border-ocean-700 text-ocean-400 rounded-lg hover:bg-ocean-900/30 transition-colors text-sm font-medium"
					>Add {selectedIds.size} to Cart</button>
				{/if}
				{#if totalPages > 1}
					<div class="flex items-center gap-1 text-xs text-slate-500">
						<button
							onclick={() => (currentPage = Math.max(0, currentPage - 1))}
							disabled={currentPage === 0}
							class="px-2 py-1 rounded border border-slate-700 hover:bg-slate-800 disabled:opacity-30"
						>&laquo; Prev</button>
						<span>{currentPage + 1}/{totalPages}</span>
						<button
							onclick={() => (currentPage = Math.min(totalPages - 1, currentPage + 1))}
							disabled={currentPage >= totalPages - 1}
							class="px-2 py-1 rounded border border-slate-700 hover:bg-slate-800 disabled:opacity-30"
						>Next &raquo;</button>
					</div>
				{/if}
			</div>
		</div>

		<div class="rounded-lg border border-slate-800 overflow-hidden">
			<table class="w-full text-sm">
				<thead>
					<tr class="bg-slate-900/50 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
						<th class="w-8 px-2 py-2">
							<input
								type="checkbox"
								checked={allPageSelected}
								onchange={toggleSelectAll}
								class="accent-ocean-500"
								title={allPageSelected ? 'Deselect all on this page' : 'Select all on this page'}
							/>
						</th>
						<th class="px-3 py-2 text-left font-medium">
							<button onclick={() => toggleSort('date')} class="hover:text-white transition-colors">
								Date {sortKey === 'date' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
							</button>
						</th>
						<th class="px-3 py-2 text-left font-medium">
							<button onclick={() => toggleSort('type')} class="hover:text-white transition-colors">
								Type {sortKey === 'type' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
							</button>
						</th>
						<th class="px-3 py-2 text-left font-medium">
							<button onclick={() => toggleSort('name')} class="hover:text-white transition-colors">
								Name {sortKey === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
							</button>
						</th>
						<th class="px-3 py-2 text-left font-medium text-slate-500">ID</th>
						<th class="px-3 py-2 text-left font-medium">
							<button onclick={() => toggleSort('detail')} class="hover:text-white transition-colors">
								Detail {sortKey === 'detail' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
							</button>
						</th>
						<th class="px-3 py-2 text-left font-medium">By</th>
						<th class="px-3 py-2 text-left font-medium">
							<button onclick={() => toggleSort('updated_at')} class="hover:text-white transition-colors" title="Last modified">
								Modified {sortKey === 'updated_at' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
							</button>
						</th>
					</tr>
				</thead>
				<tbody>
					{#if pagedActivities.length === 0}
						<tr>
							<td colspan="8" class="px-3 py-8 text-center text-slate-500">
								{selectedDates.size > 0 ? 'No activities on the selected date(s).' : 'No dated activities yet.'}
							</td>
						</tr>
					{/if}
					{#each pagedActivities as act}
						{@const colors = EVENT_COLORS[act.type]}
						<tr class="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors {selectedIds.has(act.id) ? 'bg-ocean-900/20' : ''}">
							<td class="px-2 py-2">
								<input
									type="checkbox"
									checked={selectedIds.has(act.id)}
									onchange={() => toggleActivity(act.id)}
									class="accent-ocean-500"
								/>
							</td>
							<td class="px-3 py-2 text-slate-400 font-mono text-xs whitespace-nowrap">{act.date}</td>
							<td class="px-3 py-2">
								<span class="inline-flex items-center gap-1.5">
									<span class="w-2 h-2 rounded-full {colors?.dot ?? 'bg-slate-400'}"></span>
									<span class="text-slate-300 text-xs">{TYPE_LABEL[act.type] ?? act.type}</span>
								</span>
							</td>
							<td class="px-3 py-2">
								{#if TYPE_HREF[act.type]}
									<a href={TYPE_HREF[act.type](act.id)} class="text-ocean-400 hover:text-ocean-300 hover:underline">{act.name}</a>
								{:else}
									<span class="text-slate-300">{act.name}</span>
								{/if}
							</td>
							<td class="px-3 py-2 text-slate-500 font-mono text-xs whitespace-nowrap" title={act.id}>{act.id.slice(0, 8)}</td>
							<td class="px-3 py-2 text-slate-500 text-xs">{act.detail ?? ''}</td>
							<td class="px-3 py-2 text-slate-400 text-xs whitespace-nowrap">
								{#if act.created_by_username}
									<span class="inline-flex items-center gap-1.5" title="Created by @{act.created_by_username}">
										{#if act.created_by_avatar}<span class="text-sm leading-none">{act.created_by_avatar}</span>{/if}
										<span>@{act.created_by_username}</span>
									</span>
								{:else}
									<span class="text-slate-600">—</span>
								{/if}
							</td>
							<td class="px-3 py-2 text-slate-500 font-mono text-xs whitespace-nowrap" title={act.updated_at ?? ''}>
								{act.updated_at ? act.updated_at.slice(0, 10) : '—'}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if totalPages > 1}
			<div class="flex items-center justify-end text-xs text-slate-500">
				<div class="flex items-center gap-1">
					<button
						onclick={() => (currentPage = Math.max(0, currentPage - 1))}
						disabled={currentPage === 0}
						class="px-2 py-1 rounded border border-slate-700 hover:bg-slate-800 disabled:opacity-30"
					>&laquo; Prev</button>
					<span>{currentPage + 1}/{totalPages}</span>
					<button
						onclick={() => (currentPage = Math.min(totalPages - 1, currentPage + 1))}
						disabled={currentPage >= totalPages - 1}
						class="px-2 py-1 rounded border border-slate-700 hover:bg-slate-800 disabled:opacity-30"
					>Next &raquo;</button>
				</div>
			</div>
		{/if}
	</div>
</div>
