<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let oldPassword = $state('');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let saving = $state(false);
	let errorMsg = $state('');
	let savedMsg = $state('');

	const ROLE_LABELS: Record<string, string> = {
		admin: 'Administrator — full access, can manage users and settings',
		user: 'User — can read and edit all sample data',
		viewer: 'Viewer — read-only access to sample data'
	};

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		errorMsg = '';
		savedMsg = '';
		if (newPassword !== confirmPassword) {
			errorMsg = 'New passwords do not match';
			return;
		}
		if (newPassword.length < 10) {
			errorMsg = 'New password must be at least 10 characters';
			return;
		}
		saving = true;
		const res = await fetch('/api/account/password', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
		});
		if (res.ok) {
			savedMsg = 'Password updated.';
			oldPassword = '';
			newPassword = '';
			confirmPassword = '';
		} else {
			const err = await res.json().catch(() => null);
			errorMsg = err?.error || `Failed (${res.status})`;
		}
		saving = false;
	}

	const inputCls =
		'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';
</script>

<div class="max-w-xl space-y-8">
	<div>
		<h1 class="text-2xl font-bold text-white">Account</h1>
		<p class="text-slate-400 mt-1 text-sm">Your sign-in details and password.</p>
	</div>

	<!-- Identity card -->
	<div class="p-4 rounded-lg bg-slate-800/50 border border-slate-800 space-y-3">
		<div class="flex items-center gap-3">
			{#if data.user?.avatar_url}
				<img src={data.user.avatar_url} alt="" class="w-10 h-10 rounded-full" />
			{:else}
				<div class="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-400">
					{data.user?.username?.charAt(0).toUpperCase()}
				</div>
			{/if}
			<div>
				<div class="text-white font-medium">{data.user?.username}</div>
				<div class="text-xs text-slate-500">
					{#if data.user?.is_local_account}local account{:else if data.user?.github_id}GitHub account{/if}
					{#if data.user?.email} · {data.user.email}{/if}
				</div>
			</div>
		</div>
		<div class="text-sm">
			<span class="px-2 py-0.5 rounded text-xs font-medium
				{data.user?.role === 'admin'
					? 'bg-ocean-900/40 text-ocean-300 border border-ocean-800'
					: data.user?.role === 'viewer'
						? 'bg-slate-800 text-slate-400 border border-slate-700'
						: 'bg-slate-700/50 text-slate-300 border border-slate-700'}">
				{data.user?.role}
			</span>
			<span class="text-slate-500 ml-2">{ROLE_LABELS[data.user?.role ?? 'user']}</span>
		</div>
	</div>

	<!-- Change password -->
	<div class="space-y-3">
		<h2 class="text-base font-semibold text-white">Change password</h2>

		{#if data.user?.is_local_account}
			<p class="text-xs text-slate-500">Set a new password for your local account.</p>

			{#if errorMsg}
				<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">
					{errorMsg}
				</div>
			{/if}
			{#if savedMsg}
				<div class="p-3 rounded-lg bg-green-900/30 border border-green-800 text-green-300 text-sm">
					{savedMsg}
				</div>
			{/if}

			<form onsubmit={submit} class="space-y-3">
				<input
					type="password"
					bind:value={oldPassword}
					required
					placeholder="Current password"
					class={inputCls}
				/>
				<input
					type="password"
					bind:value={newPassword}
					required
					minlength="10"
					placeholder="New password (min 10 characters)"
					class={inputCls}
				/>
				<input
					type="password"
					bind:value={confirmPassword}
					required
					minlength="10"
					placeholder="Confirm new password"
					class={inputCls}
				/>
				<button
					type="submit"
					disabled={saving}
					class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium"
				>
					{saving ? 'Updating...' : 'Update password'}
				</button>
			</form>
		{:else}
			<p class="text-sm text-slate-400">
				This account signs in via GitHub OAuth and doesn't have a local password.
				There's nothing to change here — manage your GitHub credentials at
				<a href="https://github.com/settings/security" target="_blank" class="text-ocean-400 hover:text-ocean-300">github.com/settings/security</a>.
			</p>
		{/if}
	</div>
</div>
