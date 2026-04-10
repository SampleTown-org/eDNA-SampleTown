<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const cards = [
		{ href: '/projects',  label: 'Projects',       count: data.counts.projects },
		{ href: '/sites',     label: 'Sites',          count: data.counts.sites },
		{ href: '/samples',   label: 'Samples',        count: data.counts.samples },
		{ href: '/extracts',  label: 'DNA Extracts',   count: data.counts.extracts },
		{ href: '/pcr',       label: 'PCR Plates',     count: data.counts.pcrPlates },
		{ href: '/libraries', label: 'Library Plates', count: data.counts.libraryPlates },
		{ href: '/runs',      label: 'Sequencing Runs',count: data.counts.runs },
		{ href: '/analysis',  label: 'Analyses',       count: data.counts.analyses }
	];

	// --- Event calendar ---------------------------------------------------
	// Each event_type gets a distinct tailwind color class. Days with multiple
	// event types stack the colors as small dots inside the cell.
	const EVENT_COLORS: Record<string, { dot: string; label: string }> = {
		sample:  { dot: 'bg-ocean-400',   label: 'Sample collection' },
		extract: { dot: 'bg-emerald-400', label: 'DNA extraction' },
		pcr:     { dot: 'bg-amber-400',   label: 'PCR plate' },
		library: { dot: 'bg-violet-400',  label: 'Library prep' },
		run:     { dot: 'bg-rose-400',    label: 'Sequencing run' }
	};

	// Group events by date for O(1) lookup by ISO date string.
	const eventsByDate = $derived.by(() => {
		const map = new Map<string, { type: string; count: number }[]>();
		for (const e of data.events) {
			if (!e.date) continue;
			const arr = map.get(e.date) ?? [];
			arr.push({ type: e.type, count: e.count });
			map.set(e.date, arr);
		}
		return map;
	});

	// Available years — distinct years from events, always including current year.
	const years = $derived.by(() => {
		const set = new Set<number>();
		for (const e of data.events) {
			if (e.date) set.add(Number(e.date.slice(0, 4)));
		}
		set.add(new Date().getFullYear());
		return Array.from(set).sort((a, b) => b - a);
	});

	let selectedYear = $state(new Date().getFullYear());

	// Build a grid for the selected year: 12 rows (months) × 31 cols (days).
	// Cells for days that don't exist in a given month (e.g. Feb 30) are blank.
	const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	function daysInMonth(year: number, month: number): number {
		return new Date(year, month + 1, 0).getDate();
	}
	function iso(year: number, month: number, day: number): string {
		const m = String(month + 1).padStart(2, '0');
		const d = String(day).padStart(2, '0');
		return `${year}-${m}-${d}`;
	}
</script>

<div class="space-y-8">
	<div>
		<h1 class="text-3xl font-bold text-white tracking-tight">SampleTown</h1>
		<p class="text-slate-400 mt-1">eDNA sample tracking &middot; MIxS-compliant</p>
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
			<select
				bind:value={selectedYear}
				class="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500"
			>
				{#each years as y}<option value={y}>{y}</option>{/each}
			</select>
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
									{@const dateKey = iso(selectedYear, mi, day)}
									{@const dayEvents = eventsByDate.get(dateKey) ?? []}
									<td
										class="w-5 h-5 border border-slate-800/60 {dayEvents.length > 0
											? 'bg-slate-800/80'
											: 'bg-slate-900/40'}"
										title={dayEvents.length > 0
											? `${dateKey}\n` + dayEvents.map((e) => `${EVENT_COLORS[e.type]?.label ?? e.type}: ${e.count}`).join('\n')
											: dateKey}
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
			</div>
		</div>
	</div>
</div>
