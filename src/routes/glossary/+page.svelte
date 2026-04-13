<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	let search = $state('');
	let subset = $state<string>('');
	let checklistFilter = $state<string>('');
	let extensionFilter = $state<string>('');

	let subsets = $derived.by(() => {
		const s = new Set<string>();
		for (const slot of data.slots) for (const sub of slot.in_subset) s.add(sub);
		return Array.from(s).sort();
	});

	const checklistProps = $derived(
		Object.fromEntries(data.checklists.map((c) => [c.name, new Set(c.properties)]))
	);
	const extensionProps = $derived(
		Object.fromEntries(data.extensions.map((e) => [e.name, new Set(e.properties)]))
	);

	/** Slots referenced by the active (checklist, extension, combo) filter. Null = no filter. */
	let schemaSlotSet = $derived.by<Set<string> | null>(() => {
		if (checklistFilter && extensionFilter) {
			const combo = data.combos[`${checklistFilter}|${extensionFilter}`];
			return combo ? new Set(combo) : new Set();
		}
		if (checklistFilter) return checklistProps[checklistFilter] ?? new Set();
		if (extensionFilter) return extensionProps[extensionFilter] ?? new Set();
		return null;
	});

	let activeFilterLabel = $derived.by(() => {
		if (checklistFilter && extensionFilter) {
			const c = data.checklists.find((x) => x.name === checklistFilter);
			const e = data.extensions.find((x) => x.name === extensionFilter);
			return `${c?.title ?? checklistFilter} + ${e?.title ?? extensionFilter}`;
		}
		if (checklistFilter) {
			const c = data.checklists.find((x) => x.name === checklistFilter);
			return c?.title ?? checklistFilter;
		}
		if (extensionFilter) {
			const e = data.extensions.find((x) => x.name === extensionFilter);
			return e?.title ?? extensionFilter;
		}
		return '';
	});

	function clearSchemaFilter() {
		checklistFilter = '';
		extensionFilter = '';
	}

	let filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const schemaSet = schemaSlotSet;
		return data.slots.filter((s) => {
			if (subset && !s.in_subset.includes(subset)) return false;
			if (schemaSet && !schemaSet.has(s.name)) return false;
			if (!q) return true;
			return (
				s.name.toLowerCase().includes(q) ||
				s.title.toLowerCase().includes(q) ||
				s.description.toLowerCase().includes(q) ||
				s.keywords.some((k) => k.toLowerCase().includes(q))
			);
		});
	});
</script>

<svelte:head>
	<title>MIxS Glossary · SampleTown</title>
</svelte:head>

<div class="max-w-5xl space-y-4">
	<div>
		<h1 class="text-2xl font-bold text-white">MIxS Glossary</h1>
		<p class="text-sm text-slate-400">
			Reference for MIxS v{data.version} slots, checklists, and extensions.
			Sourced from the GSC LinkML schema at build time.
			{data.slots.length} slots · {data.checklists.length} checklists · {data.extensions.length} extensions.
		</p>
	</div>

	<!-- Controls -->
	<div class="flex gap-3 flex-wrap items-center">
		<input
			type="search"
			bind:value={search}
			placeholder="Search name, title, description, keywords..."
			class="flex-1 min-w-64 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500"
		/>
		<select
			bind:value={subset}
			class="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500"
		>
			<option value="">All subsets</option>
			{#each subsets as sub}
				<option value={sub}>{sub}</option>
			{/each}
		</select>
		<span class="text-xs text-slate-500">{filtered.length} matching</span>
	</div>

	<!-- Active checklist/extension filter chip -->
	{#if checklistFilter || extensionFilter}
		<div class="flex items-center gap-2 text-xs p-2 rounded-lg border border-ocean-800/60 bg-ocean-950/30">
			<span class="text-slate-400">Filtered to parameters in:</span>
			<span class="px-2 py-0.5 rounded bg-ocean-800/60 text-ocean-100 font-medium">{activeFilterLabel}</span>
			<button
				type="button"
				onclick={clearSchemaFilter}
				class="ml-auto text-slate-400 hover:text-white"
				title="Clear filter"
			>Clear ×</button>
		</div>
	{/if}

	<!-- Checklists & Extensions panels -->
	<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
		<details class="rounded-lg border border-slate-800 bg-slate-900/40 p-3" open={!!checklistFilter}>
			<summary class="cursor-pointer text-sm font-semibold text-slate-300">
				Checklists ({data.checklists.length})
				<span class="text-[11px] font-normal text-slate-500">— click to filter</span>
			</summary>
			<ul class="mt-2 space-y-1.5 text-xs">
				{#each data.checklists as c}
					<li>
						<button
							type="button"
							onclick={() => (checklistFilter = checklistFilter === c.name ? '' : c.name)}
							class="text-left hover:underline {checklistFilter === c.name ? 'font-semibold' : ''}"
						>
							<code class="{checklistFilter === c.name ? 'text-ocean-300' : 'text-ocean-400'}">{c.name}</code>
							<span class="text-slate-400"> — {c.title}</span>
							<span class="text-slate-600">({c.properties.length})</span>
						</button>
						{#if c.description}
							<p class="text-slate-500 text-[11px] pl-4">{c.description}</p>
						{/if}
					</li>
				{/each}
			</ul>
		</details>

		<details class="rounded-lg border border-slate-800 bg-slate-900/40 p-3" open={!!extensionFilter}>
			<summary class="cursor-pointer text-sm font-semibold text-slate-300">
				Extensions ({data.extensions.length})
				<span class="text-[11px] font-normal text-slate-500">— click to filter</span>
			</summary>
			<ul class="mt-2 space-y-1.5 text-xs">
				{#each data.extensions as e}
					<li>
						<button
							type="button"
							onclick={() => (extensionFilter = extensionFilter === e.name ? '' : e.name)}
							class="text-left hover:underline {extensionFilter === e.name ? 'font-semibold' : ''}"
						>
							<code class="{extensionFilter === e.name ? 'text-ocean-300' : 'text-ocean-400'}">{e.name}</code>
							<span class="text-slate-400"> — {e.title}</span>
							<span class="text-slate-600">({e.properties.length})</span>
						</button>
					</li>
				{/each}
			</ul>
		</details>
	</div>

	<!-- Slots -->
	<div class="space-y-2">
		{#each filtered as slot (slot.name)}
			<div id={slot.name} class="rounded-lg border border-slate-800 bg-slate-900/40 p-3 scroll-mt-4">
				<div class="flex items-baseline justify-between gap-2 flex-wrap">
					<div>
						<code class="text-ocean-400 font-mono text-sm">{slot.name}</code>
						<span class="text-slate-300 text-sm ml-2">{slot.title}</span>
					</div>
					<div class="flex items-center gap-2 text-[11px] text-slate-500">
						{#if slot.range && slot.range !== 'string'}
							<span class="px-1.5 py-0.5 rounded bg-slate-800">{slot.range}</span>
						{/if}
						{#each slot.in_subset as sub}
							<span class="px-1.5 py-0.5 rounded bg-slate-800">{sub}</span>
						{/each}
						{#if slot.slot_uri}
							<code>{slot.slot_uri}</code>
						{/if}
					</div>
				</div>
				{#if slot.description}
					<p class="text-sm text-slate-300 mt-1 leading-snug">{slot.description}</p>
				{/if}
				{#if slot.examples.length > 0}
					<div class="mt-1 text-xs">
						<span class="text-slate-500">Example: </span>
						<code class="text-slate-200">{slot.examples[0]}</code>
					</div>
				{/if}
				{#if slot.pattern}
					<div class="mt-1 text-xs">
						<span class="text-slate-500">Pattern: </span>
						<code class="text-slate-400">{slot.pattern}</code>
					</div>
				{/if}
			</div>
		{/each}
		{#if filtered.length === 0}
			<p class="text-sm text-slate-500 italic">No slots match the current filter.</p>
		{/if}
	</div>
</div>
