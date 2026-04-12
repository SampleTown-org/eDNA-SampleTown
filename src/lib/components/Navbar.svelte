<script lang="ts">
	import type { User } from '$lib/types';
	import { cart } from '$lib/stores/cart.svelte';

	interface Props {
		user: User | null;
	}

	let { user }: Props = $props();

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
	<div class="px-4">
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

				<!-- Cart toggle (always visible, far right) -->
				<button
					onclick={() => { cart.toggleSidebar(); if (cart.count === 0 && !cart.sidebarOpen) cart.openSidebar(); }}
					class="relative px-2 py-1 text-sm transition-colors {cart.sidebarOpen ? 'text-ocean-400' : 'text-slate-400 hover:text-white'}"
					title="{cart.sidebarOpen ? 'Close' : 'Open'} cart"
				>
					Cart
					{#if cart.count > 0}
						<span class="absolute -top-1 -right-1 w-4 h-4 bg-ocean-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
							{cart.count}
						</span>
					{/if}
				</button>

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
