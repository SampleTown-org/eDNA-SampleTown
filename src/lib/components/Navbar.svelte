<script lang="ts">
	import type { User } from '$lib/types';
	import { cart, type CartItem, type CartEntityType } from '$lib/stores/cart.svelte';

	interface Props {
		user: User | null;
	}

	let { user }: Props = $props();
	let cartOpen = $state(false);

	const TYPE_LABELS: Record<CartEntityType, string> = {
		site: 'Sites', sample: 'Samples', extract: 'Extracts',
		pcr: 'PCR Reactions', pcr_plate: 'PCR Plates',
		library: 'Libraries', library_plate: 'Library Plates',
		run: 'Runs', analysis: 'Analyses'
	};

	const TYPE_TARGETS: Record<CartEntityType, { href: string; label: string } | null> = {
		sample: { href: '/extracts/new', label: 'New Extracts' },
		extract: { href: '/pcr/new', label: 'New PCR Plate' },
		pcr: { href: '/libraries/new', label: 'New Library Plate' },
		pcr_plate: { href: '/libraries/new', label: 'New Library Plate' },
		library: { href: '/runs/new', label: 'New Run' },
		library_plate: { href: '/runs/new', label: 'New Run' },
		run: null, analysis: null, site: null
	};

	let groupedCart = $derived(() => {
		const groups: { type: CartEntityType; label: string; items: CartItem[]; target: { href: string; label: string } | null }[] = [];
		const seen = new Set<string>();
		for (const item of cart.items) {
			if (!seen.has(item.type)) {
				seen.add(item.type);
				groups.push({
					type: item.type as CartEntityType,
					label: TYPE_LABELS[item.type as CartEntityType] ?? item.type,
					items: cart.getByType(item.type as CartEntityType),
					target: TYPE_TARGETS[item.type as CartEntityType] ?? null
				});
			}
		}
		return groups;
	});

	// Role-aware account icon: tells the user (and an admin glancing at someone
	// else's screen) what role they're signed in as. Clicking goes to /account.
	// Marine theme — admin = octopus (many arms, manages everything),
	// user = fish (regular member of the school), viewer = shell (observes
	// from the seafloor, doesn't move much).
	const ROLE_ICON: Record<string, string> = {
		admin: '🐙',
		user: '🐟',
		viewer: '🐚'
	};
	const ROLE_LABEL: Record<string, string> = {
		admin: 'Administrator',
		user: 'User',
		viewer: 'Viewer (read-only)'
	};

	const navLinks = [
		{ href: '/', label: 'Dashboard' },
		{ href: '/projects', label: 'Projects' },
		{ href: '/sites', label: 'Sites' },
		{ href: '/samples', label: 'Samples' },
		{ href: '/extracts', label: 'Extracts' },
		{ href: '/pcr', label: 'PCR' },
		{ href: '/libraries', label: 'Libraries' },
		{ href: '/runs', label: 'Runs' },
		{ href: '/analysis', label: 'Analysis' },
		{ href: '/export', label: 'Import/Export' },
		{ href: '/settings', label: 'Settings' }
	];

	let mobileOpen = $state(false);
</script>

<nav class="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
	<div class="max-w-7xl mx-auto px-4">
		<div class="flex items-center justify-between h-14">
			<a href="/" class="flex items-center gap-2 text-ocean-400 font-bold text-lg tracking-tight">
				<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
					<path d="M8 12c0-2 1-4 4-4s4 2 4 4-1 4-4 4-4-2-4-4z" />
				</svg>
				SampleTown
			</a>

			<!-- Desktop nav -->
			<div class="hidden md:flex items-center gap-1">
				{#each navLinks as link}
					<a
						href={link.href}
						class="px-3 py-1.5 rounded text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
					>
						{link.label}
					</a>
				{/each}
			</div>

			<div class="flex items-center gap-3">
				<!-- Cart -->
				{#if cart.count > 0}
					<div class="relative">
						<button
							onclick={() => (cartOpen = !cartOpen)}
							class="relative px-2 py-1 text-sm text-slate-300 hover:text-white transition-colors"
							title="Selection cart"
						>
							Cart
							<span class="absolute -top-1 -right-1 w-4 h-4 bg-ocean-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
								{cart.count}
							</span>
						</button>

						{#if cartOpen}
							<!-- Backdrop -->
							<button class="fixed inset-0 z-40" onclick={() => (cartOpen = false)} aria-label="Close cart"></button>

							<!-- Dropdown -->
							<div class="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50">
								<div class="p-3 border-b border-slate-800 flex items-center justify-between">
									<span class="text-sm font-semibold text-white">Cart ({cart.count})</span>
									<button onclick={() => { cart.clearAll(); cartOpen = false; }} class="text-xs text-slate-500 hover:text-red-400">Clear all</button>
								</div>

								{#each groupedCart() as group}
									<div class="border-b border-slate-800/50">
										<div class="px-3 py-2 flex items-center justify-between">
											<span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">{group.label} ({group.items.length})</span>
											<div class="flex items-center gap-2">
												{#if group.target}
													<a href={group.target.href} onclick={() => (cartOpen = false)} class="text-xs text-ocean-400 hover:text-ocean-300">{group.target.label} &rarr;</a>
												{/if}
												<button onclick={() => cart.clearType(group.type)} class="text-xs text-slate-600 hover:text-red-400">Clear</button>
											</div>
										</div>
										{#each group.items as item}
											<div class="px-3 py-1.5 flex items-center justify-between hover:bg-slate-800/30 text-sm">
												<div class="min-w-0">
													<span class="text-slate-200 truncate block">{item.label}</span>
													{#if item.sublabel}
														<span class="text-xs text-slate-500">{item.sublabel}</span>
													{/if}
												</div>
												<button onclick={() => cart.remove(item.type as CartEntityType, item.id)} class="text-slate-600 hover:text-red-400 shrink-0 ml-2 text-xs">x</button>
											</div>
										{/each}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/if}

				{#if user}
					<span class="text-sm text-slate-400 hidden sm:inline">{user.username}</span>
					<a
						href="/account"
						class="text-base hover:opacity-80 transition-opacity"
						title="{ROLE_LABEL[user.role] ?? user.role} — manage account"
					>{ROLE_ICON[user.role] ?? '👤'}</a>
					<form method="POST" action="/auth/logout" class="inline">
						<button type="submit" class="text-sm text-slate-400 hover:text-white">Sign out</button>
					</form>
				{:else}
					<a href="/auth/login" class="text-sm text-ocean-400 hover:text-ocean-300">Sign in</a>
				{/if}

				<!-- Mobile menu button -->
				<button
					class="md:hidden p-1.5 text-slate-400 hover:text-white"
					onclick={() => (mobileOpen = !mobileOpen)}
				>
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
						{#if mobileOpen}
							<path d="M6 18L18 6M6 6l12 12" />
						{:else}
							<path d="M4 6h16M4 12h16M4 18h16" />
						{/if}
					</svg>
				</button>
			</div>
		</div>

		<!-- Mobile nav -->
		{#if mobileOpen}
			<div class="md:hidden pb-3 border-t border-slate-800 mt-1 pt-2">
				{#each navLinks as link}
					<a
						href={link.href}
						class="block px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-800 rounded"
						onclick={() => (mobileOpen = false)}
					>
						{link.label}
					</a>
				{/each}
			</div>
		{/if}
	</div>
</nav>
