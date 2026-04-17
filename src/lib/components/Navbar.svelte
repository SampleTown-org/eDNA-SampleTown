<script lang="ts">
	import type { User } from '$lib/types';
	import { cart } from '$lib/stores/cart.svelte';
	import Scanner from './Scanner.svelte';
	import { invalidateAll } from '$app/navigation';

	let scanOpen = $state(false);
	let labSwitcherOpen = $state(false);

	interface Props {
		user: User | null;
		lab: { id: string; name: string; slug: string } | null;
		labs: { id: string; name: string; slug: string; role: string }[];
	}

	let { user, lab, labs }: Props = $props();
	const showLabSwitcher = $derived(labs.length > 0);

	async function switchLab(labId: string) {
		labSwitcherOpen = false;
		const res = await fetch('/api/account/active-lab', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ lab_id: labId })
		});
		if (res.ok) {
			cart.clearAll();
			window.location.href = '/';
		}
	}

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

	/** `desktopOnly` links are hidden on <sm screens — reserved for flows that
	 *  don't make sense on mobile.
	 *
	 *  Dashboard is intentionally not here — the SampleTown.org brand link
	 *  on the left already navigates to /. Analysis is hidden until the
	 *  pipeline-launch UI is wired up. Import/Export and Glossary are
	 *  reachable from the Manage page (they're admin-leaning tools that
	 *  don't need top-level real estate). */
	const navLinks: { href: string; label: string; desktopOnly?: boolean; writerOnly?: boolean }[] = [
		{ href: '/projects', label: 'Projects' },
		{ href: '/sites', label: 'Sites' },
		{ href: '/samples', label: 'Samples' },
		{ href: '/extracts', label: 'Extracts' },
		{ href: '/pcr', label: 'PCR' },
		{ href: '/libraries', label: 'Libraries' },
		{ href: '/runs', label: 'Runs' },
		{ href: '/settings', label: 'Manage', writerOnly: true }
	];

	let mobileOpen = $state(false);
</script>

<nav class="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm sticky top-0 z-50">
	<div class="px-4">
		<div class="flex items-center justify-between h-14">
			<div class="flex items-center gap-2">
				<a href="/" class="flex items-center gap-2 text-ocean-400 font-bold text-lg tracking-tight">
					<svg class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
						<path d="M7 3c0 4 10 5 10 9s-10 5-10 9" />
						<path d="M17 3c0 4-10 5-10 9s10 5 10 9" />
						<path d="M9 5h6 M8 9h8 M8 15h8 M9 19h6" />
					</svg>
					SampleTown.org
				</a>
				{#if lab}
					<span class="text-slate-600 hidden sm:inline">/</span>
					{#if showLabSwitcher}
						<div class="relative hidden sm:block">
							<button
								onclick={() => (labSwitcherOpen = !labSwitcherOpen)}
								class="text-sm text-slate-300 hover:text-white flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-800 transition-colors"
							>
								{lab.name}
								<svg class="w-3 h-3 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
									<path d="M6 9l6 6 6-6" />
								</svg>
							</button>
							{#if labSwitcherOpen}
								<button class="fixed inset-0 z-40" onclick={() => (labSwitcherOpen = false)} aria-label="Close"></button>
								<div class="absolute left-0 top-full mt-1 w-56 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50 py-1">
									{#each labs as l}
										<button
											onclick={() => switchLab(l.id)}
											class="w-full text-left px-3 py-2 text-sm hover:bg-slate-700 transition-colors flex items-center justify-between
												{l.id === lab.id ? 'text-ocean-400' : 'text-slate-300'}"
										>
											<span>{l.name}</span>
											<span class="text-xs text-slate-500">{l.role}</span>
										</button>
									{/each}
									<div class="border-t border-slate-700 mt-1 pt-1">
										<a
											href="/auth/setup-lab"
											onclick={() => (labSwitcherOpen = false)}
											class="block w-full text-left px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
										>
											<span class="inline-flex items-center gap-1.5">
												<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2"><path d="M12 5v14M5 12h14" /></svg>
												New lab
											</span>
										</a>
									</div>
								</div>
							{/if}
						</div>
					{/if}
				{/if}
			</div>

			<!-- Desktop nav (only for signed-in users) -->
			{#if user}
				<div class="hidden md:flex items-center gap-1">
					{#each navLinks.filter((l) => !l.writerOnly || user?.role !== 'viewer') as link}
						<a
							href={link.href}
							class="px-3 py-1.5 rounded text-sm text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
						>
							{link.label}
						</a>
					{/each}
				</div>
			{/if}

			<div class="flex items-center gap-3">
				{#if user}
					<!-- Cart sits between the main nav and the right-side icon
					     cluster (search/qr/username/emoji/sign out) per beta
					     feedback — it's a workflow tool, closer in role to the
					     nav than to the account utilities. -->
					<button
						onclick={() => { cart.toggleSidebar(); if (cart.count === 0 && !cart.sidebarOpen) cart.openSidebar(); }}
						class="relative p-1 transition-colors {cart.sidebarOpen ? 'text-ocean-400' : 'text-slate-400 hover:text-white'}"
						title="{cart.sidebarOpen ? 'Close' : 'Open'} cart ({cart.count})"
						aria-label="{cart.sidebarOpen ? 'Close' : 'Open'} cart"
					>
						<!-- Shopping-cart icon. Same visual weight as the
						     other right-side icons (search, scan). -->
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
							<path d="M3 3h2l.4 2M7 13h10l3-8H6.4M7 13l-1.6 4.6a1 1 0 00.9 1.4H19" />
							<circle cx="9" cy="20" r="1.5" />
							<circle cx="17" cy="20" r="1.5" />
						</svg>
						{#if cart.count > 0}
							<span class="absolute -top-1 -right-1 min-w-[1rem] h-4 px-1 bg-ocean-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
								{cart.count}
							</span>
						{/if}
					</button>

					<!-- Right-side cluster, ordered: search → qr → username → emoji → sign out -->
					<a
						href="/#dashboard-search"
						class="text-slate-400 hover:text-white"
						title="Search dashboard"
						aria-label="Search"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
							<circle cx="11" cy="11" r="7" />
							<path d="m20 20-3.5-3.5" />
						</svg>
					</a>
					<button
						type="button"
						onclick={() => (scanOpen = true)}
						class="text-slate-400 hover:text-white"
						title="Scan QR code"
						aria-label="Scan QR code"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
							<path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/>
							<path d="M7 8h3v3H7zM14 8h3v3h-3zM7 13h3v3H7zM14 13h3v3h-3z"/>
						</svg>
					</button>
					<a
						href="/account"
						class="text-sm text-slate-400 hover:text-white hidden sm:inline"
						title="Manage account"
					>{user.username}</a>
					<a
						href="/account"
						class="text-base hover:opacity-80 transition-opacity"
						title="{ROLE_LABEL[user.role] ?? user.role} — manage account"
					>{user.avatar_emoji ?? ROLE_ICON[user.role] ?? '👤'}</a>
					<form method="POST" action="/auth/logout" class="inline">
						<button type="submit" class="text-sm text-slate-400 hover:text-white">Sign out</button>
					</form>

					<button
						class="md:hidden p-1.5 text-slate-400 hover:text-white"
						onclick={() => (mobileOpen = !mobileOpen)}
						aria-label="Toggle menu"
					>
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
							{#if mobileOpen}
								<path d="M6 18L18 6M6 6l12 12" />
							{:else}
								<path d="M4 6h16M4 12h16M4 18h16" />
							{/if}
						</svg>
					</button>
				{:else}
					<a href="/auth/login" class="text-sm text-ocean-400 hover:text-ocean-300">Sign in</a>
				{/if}
			</div>
		</div>

		<!-- Mobile nav (only when signed in; the toggle is also hidden otherwise) -->
		{#if mobileOpen && user}
			<div class="md:hidden pb-3 border-t border-slate-800 mt-1 pt-2">
				{#each navLinks.filter((l) => !l.desktopOnly && (!l.writerOnly || user?.role !== 'viewer')) as link}
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

<Scanner bind:open={scanOpen} onclose={() => (scanOpen = false)} />
