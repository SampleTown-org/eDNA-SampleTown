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

	// ---- Saved carts ----
	interface SavedCart {
		id: string;
		name: string;
		is_public: number;
		user_id: string;
		owner_username: string | null;
		owner_avatar: string | null;
		item_count: number;
		created_at: string;
		updated_at: string;
	}

	let savedCarts = $state<SavedCart[]>([]);
	let savedOpen = $state(false);
	let savedLoading = $state(false);
	let savedError = $state<string | null>(null);
	let currentUserId = $state<string | null>(null);

	// Inline save form state (no prompt()/confirm() dialogs).
	let saveFormOpen = $state(false);
	let saveName = $state('');
	let saveIsPublic = $state(false);
	let saveNameEl = $state<HTMLInputElement | undefined>(undefined);

	async function refreshSaved() {
		savedLoading = true;
		savedError = null;
		try {
			const res = await fetch('/api/saved-carts');
			if (!res.ok) {
				if (res.status === 401) {
					currentUserId = null;
					savedCarts = [];
					return;
				}
				savedError = `HTTP ${res.status}`;
				return;
			}
			const rows = (await res.json()) as SavedCart[];
			savedCarts = rows;
			// Grab own user id from an owned row so we can tell which entries
			// are deletable. Fallback to null if we have no owned carts.
			const own = rows.find((r) => r.owner_username && r.user_id);
			currentUserId = own?.user_id ?? currentUserId;
		} catch (err) {
			savedError = err instanceof Error ? err.message : 'Failed to load';
		} finally {
			savedLoading = false;
		}
	}

	$effect(() => {
		if (savedOpen) refreshSaved();
	});

	function openSaveForm() {
		if (cart.count === 0) return;
		savedError = null;
		saveName = '';
		saveIsPublic = false;
		saveFormOpen = true;
		savedOpen = true;
		// Focus the name input on the next tick, after the form renders.
		queueMicrotask(() => saveNameEl?.focus());
	}

	function cancelSave() {
		saveFormOpen = false;
		saveName = '';
		saveIsPublic = false;
	}

	async function submitSave() {
		const name = saveName.trim();
		if (!name) return;
		savedError = null;
		const res = await fetch('/api/saved-carts', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name,
				is_public: saveIsPublic,
				items: cart.items
			})
		});
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			savedError = body.error ?? `HTTP ${res.status}`;
			return;
		}
		saveFormOpen = false;
		saveName = '';
		saveIsPublic = false;
		await refreshSaved();
	}

	async function loadCart(id: string) {
		const res = await fetch(`/api/saved-carts/${id}`);
		if (!res.ok) {
			const body = await res.json().catch(() => ({}));
			savedError = body.error ?? `HTTP ${res.status}`;
			return;
		}
		const { items } = (await res.json()) as { items: CartItem[] };
		if (cart.count > 0 && !confirm(`Replace current cart (${cart.count} item${cart.count === 1 ? '' : 's'}) with saved one?`)) {
			return;
		}
		cart.replaceAll(items);
		// Refresh section-open state so the newly-loaded types are expanded.
		openSections = new Set(SECTIONS.filter((s) => cart.getByType(s.type).length > 0).map((s) => s.type));
	}

	async function deleteSaved(id: string, name: string) {
		if (!confirm(`Delete saved cart "${name}"?`)) return;
		const res = await fetch(`/api/saved-carts/${id}`, { method: 'DELETE' });
		if (!res.ok) {
			savedError = `HTTP ${res.status}`;
			return;
		}
		await refreshSaved();
	}

	async function togglePublic(c: SavedCart) {
		const res = await fetch(`/api/saved-carts/${c.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ is_public: c.is_public ? 0 : 1 })
		});
		if (!res.ok) {
			savedError = `HTTP ${res.status}`;
			return;
		}
		await refreshSaved();
	}

	const mineCarts = $derived(savedCarts.filter((c) => c.user_id === currentUserId));
	const publicCarts = $derived(savedCarts.filter((c) => c.user_id !== currentUserId));
</script>

<aside class="w-72 shrink-0 border-l border-slate-800 bg-slate-900/60 overflow-y-auto sticky top-14 h-[calc(100vh-3.5rem)]">
	<div class="p-3 border-b border-slate-800 flex items-center justify-between">
		<span class="text-sm font-semibold text-white">Cart ({cart.count})</span>
		<div class="flex items-center gap-2">
			{#if cart.count > 0}
				<button
					onclick={openSaveForm}
					class="text-xs text-ocean-400 hover:text-ocean-300"
					title="Save this cart with a name for later"
				>Save</button>
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

	<!-- Saved carts accordion -->
	<div class="border-b border-slate-800">
		<button
			onclick={() => (savedOpen = !savedOpen)}
			class="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-800/30 transition-colors"
		>
			<span class="flex items-center gap-2">
				<span class="text-slate-500 text-xs transition-transform {savedOpen ? 'rotate-90' : ''}">&#9654;</span>
				<span class="text-xs font-semibold text-slate-300 uppercase tracking-wider">Saved carts</span>
			</span>
		</button>
		{#if savedOpen}
			<div class="px-3 pb-3 space-y-2">
				{#if saveFormOpen}
					<form
						onsubmit={(e) => { e.preventDefault(); submitSave(); }}
						class="rounded border border-ocean-900/60 bg-slate-900/80 p-2 space-y-2"
					>
						<input
							bind:this={saveNameEl}
							bind:value={saveName}
							type="text"
							placeholder="Cart name"
							maxlength="120"
							class="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-xs placeholder-slate-500 focus:outline-none focus:border-ocean-500"
						/>
						<label class="flex items-center gap-2 text-xs text-slate-300">
							<input type="checkbox" bind:checked={saveIsPublic} class="accent-ocean-500" />
							<span>Public <span class="text-slate-500">(visible to everyone)</span></span>
						</label>
						<div class="flex items-center gap-2">
							<button
								type="submit"
								disabled={!saveName.trim()}
								class="px-2 py-1 bg-ocean-600 text-white rounded text-xs hover:bg-ocean-500 disabled:opacity-40"
							>Save</button>
							<button
								type="button"
								onclick={cancelSave}
								class="px-2 py-1 text-xs text-slate-400 hover:text-white"
							>Cancel</button>
						</div>
					</form>
				{/if}
				{#if savedError}
					<div class="text-xs text-red-400">{savedError}</div>
				{/if}
				{#if savedLoading}
					<div class="text-xs text-slate-500">Loading…</div>
				{:else}
					{#if mineCarts.length > 0}
						<div class="text-[10px] uppercase tracking-wider text-slate-500 mt-1">Mine</div>
						{#each mineCarts as c}
							<div class="rounded border border-slate-800 bg-slate-900/40 p-2 space-y-1">
								<div class="flex items-center justify-between gap-1">
									<button
										onclick={() => loadCart(c.id)}
										class="flex-1 text-left text-xs text-ocean-400 hover:text-ocean-300 truncate"
										title="Load into cart"
									>{c.name}</button>
									<span class="text-[10px] text-slate-500 shrink-0">{c.item_count}</span>
								</div>
								<div class="flex items-center justify-between text-[10px] text-slate-500">
									<button
										onclick={() => togglePublic(c)}
										class="hover:text-ocean-400"
										title={c.is_public ? 'Make private' : 'Make public'}
									>{c.is_public ? '🌐 public' : '🔒 private'}</button>
									<button
										onclick={() => deleteSaved(c.id, c.name)}
										class="text-slate-600 hover:text-red-400"
										title="Delete"
									>✕</button>
								</div>
							</div>
						{/each}
					{/if}
					{#if publicCarts.length > 0}
						<div class="text-[10px] uppercase tracking-wider text-slate-500 mt-2">Public</div>
						{#each publicCarts as c}
							<div class="rounded border border-slate-800 bg-slate-900/40 p-2">
								<div class="flex items-center justify-between gap-1">
									<button
										onclick={() => loadCart(c.id)}
										class="flex-1 text-left text-xs text-ocean-400 hover:text-ocean-300 truncate"
										title="Load into cart"
									>{c.name}</button>
									<span class="text-[10px] text-slate-500 shrink-0">{c.item_count}</span>
								</div>
								<div class="text-[10px] text-slate-500 truncate" title={c.owner_username ?? ''}>
									{c.owner_avatar ?? ''} @{c.owner_username ?? 'unknown'}
								</div>
							</div>
						{/each}
					{/if}
					{#if mineCarts.length === 0 && publicCarts.length === 0}
						<div class="text-xs text-slate-500">
							Nothing saved yet. Build a cart then click <span class="text-ocean-400">Save</span>.
						</div>
					{/if}
				{/if}
			</div>
		{/if}
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
									class="block mx-3 mt-1 mb-2 px-2 py-1 text-xs text-center text-ocean-400 hover:text-ocean-300 border border-ocean-800 rounded hover:bg-ocean-900/20 transition-colors write-only"
								>{section.target.label} &rarr;</a>
							{/if}
						</div>
					{/if}
				</div>
			{/if}
		{/each}
	</div>
</aside>
