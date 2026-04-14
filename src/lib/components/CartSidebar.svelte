<script lang="ts">
	import { cart, type CartEntityType, type CartItem } from '$lib/stores/cart.svelte';

	/** Ordered entity type sections matching the lab workflow chain. */
	const SECTIONS: {
		type: CartEntityType;
		label: string;
		target?: { href: string; label: string };
	}[] = [
		{ type: 'project', label: 'Projects' },
		{ type: 'site', label: 'Sites' },
		{ type: 'sample', label: 'Samples', target: { href: '/extracts/new', label: 'New Extracts' } },
		{ type: 'extract', label: 'Extracts', target: { href: '/pcr/new', label: 'New PCR Plate' } },
		{ type: 'pcr_plate', label: 'PCR Plates', target: { href: '/libraries/new', label: 'New Library Plate' } },
		{ type: 'pcr', label: 'PCR Reactions', target: { href: '/libraries/new', label: 'New Library Plate' } },
		{ type: 'library_plate', label: 'Library Plates', target: { href: '/runs/new', label: 'New Run' } },
		{ type: 'library', label: 'Libraries', target: { href: '/runs/new', label: 'New Run' } },
		{ type: 'run', label: 'Runs' },
		{ type: 'analysis', label: 'Analyses' }
	];

	let openSections = $state<Set<string>>(new Set(
		SECTIONS.filter((s) => cart.getByType(s.type).length > 0).map((s) => s.type)
	));

	function toggleSection(type: string) {
		const next = new Set(openSections);
		if (next.has(type)) next.delete(type);
		else next.add(type);
		openSections = next;
	}
</script>

<aside class="w-72 shrink-0 border-l border-slate-800 bg-slate-900/60 overflow-y-auto sticky top-14 h-[calc(100vh-3.5rem)]">
	<div class="p-3 border-b border-slate-800 flex items-center justify-between">
		<span class="text-sm font-semibold text-white">Cart ({cart.count})</span>
		<div class="flex items-center gap-2">
			{#if cart.count > 0}
				<a
					href="/settings?tab=labels"
					class="text-xs text-ocean-400 hover:text-ocean-300"
					title="Generate QR labels for cart items on the Labels settings tab"
				>Labels</a>
				<button onclick={() => cart.clearAll()} class="text-xs text-slate-500 hover:text-red-400">Clear</button>
			{/if}
			<button
				onclick={() => cart.toggleSidebar()}
				class="text-slate-500 hover:text-white text-sm px-1"
				title="Close cart"
			>&times;</button>
		</div>
	</div>

	{#if cart.count === 0}
		<div class="p-4 text-sm text-slate-500 text-center">
			Select items from any list page to add them here.
		</div>
	{/if}

	<div class="divide-y divide-slate-800/50">
		{#each SECTIONS as section}
			{@const sectionItems = cart.getByType(section.type)}
			{#if sectionItems.length > 0}
				<div>
					<div
						onclick={() => toggleSection(section.type)}
						class="w-full flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-slate-800/30 transition-colors"
						role="button"
						tabindex="0"
					>
						<div class="flex items-center gap-2">
							<span class="text-slate-500 text-xs transition-transform {openSections.has(section.type) ? 'rotate-90' : ''}">&#9654;</span>
							<span class="text-xs font-semibold text-slate-300 uppercase tracking-wider">{section.label}</span>
							<span class="text-xs text-slate-500">({sectionItems.length})</span>
						</div>
						<button
							onclick={(e) => { e.stopPropagation(); cart.clearType(section.type); }}
							class="text-xs text-slate-600 hover:text-red-400"
						>&times;</button>
					</div>

					{#if openSections.has(section.type)}
						<div class="pb-1">
							{#each sectionItems as item}
								<div class="px-3 py-1 flex items-center justify-between hover:bg-slate-800/20 group">
									<div class="min-w-0 flex-1">
										<span class="text-xs text-slate-200 truncate block">{item.label}</span>
										{#if item.sublabel}
											<span class="text-[10px] text-slate-500 truncate block">{item.sublabel}</span>
										{/if}
									</div>
									<button
										onclick={() => cart.remove(item.type as CartEntityType, item.id)}
										class="text-slate-700 group-hover:text-slate-500 hover:!text-red-400 shrink-0 ml-1 text-xs"
									>&times;</button>
								</div>
							{/each}
							{#if section.target}
								<a
									href={section.target.href}
									class="block mx-3 mt-1 mb-2 px-2 py-1 text-xs text-center text-ocean-400 hover:text-ocean-300 border border-ocean-800 rounded hover:bg-ocean-900/20 transition-colors"
								>{section.target.label} &rarr;</a>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		{/each}
	</div>
</aside>
