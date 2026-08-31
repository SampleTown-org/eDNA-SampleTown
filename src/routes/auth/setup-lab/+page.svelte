<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';

	let mode = $state<'choose' | 'create' | 'join' | 'sync'>('choose');
	let busy = $state(false);
	let error = $state('');

	let labName = $state('');
	let labSlug = $state('');
	let token = $state('');

	// --- "Sync an existing lab" state: probe a snapshot repo, pick a lab ---
	let syncRepo = $state('');
	let syncToken = $state('');
	let syncLabs = $state<{ slug: string; taken: boolean }[] | null>(null);
	let syncSlug = $state('');
	let syncName = $state('');
	let syncWarning = $state('');

	/** "cryomics-lab" → "Cryomics Lab" — default display name for a slug. */
	function titleCase(slug: string): string {
		return slug.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
	}

	async function probeSyncRepo() {
		busy = true; error = ''; syncLabs = null; syncSlug = '';
		const res = await fetch('/api/auth/setup-lab/sync-probe', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ repo: syncRepo.trim(), token: syncToken.trim() })
		});
		const body = await res.json().catch(() => ({}));
		busy = false;
		if (!res.ok) {
			error = body.error || 'Could not reach the repo';
			return;
		}
		const labs: { slug: string; taken: boolean }[] = body.labs ?? [];
		syncLabs = labs;
		const usable = labs.filter((l) => !l.taken);
		if (usable.length === 1) selectSyncSlug(usable[0].slug);
	}

	function selectSyncSlug(slug: string) {
		syncSlug = slug;
		syncName = titleCase(slug);
	}

	async function syncExistingLab() {
		if (!syncSlug) { error = 'Pick which lab to sync'; return; }
		if (!syncName.trim()) { error = 'Lab name is required'; return; }
		busy = true; error = ''; syncWarning = '';
		const res = await fetch('/api/auth/setup-lab/sync', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				repo: syncRepo.trim(),
				token: syncToken.trim(),
				slug: syncSlug,
				name: syncName.trim()
			})
		});
		const body = await res.json().catch(() => ({}));
		if (!res.ok) {
			error = body.error || 'Failed to sync lab';
			busy = false;
			return;
		}
		if (body.warning) {
			// Lab exists but the pull will finish in the background — let the
			// user read the note before moving on.
			syncWarning = body.warning;
			busy = false;
			return;
		}
		await invalidateAll();
		goto('/');
	}

	async function continueAfterWarning() {
		await invalidateAll();
		goto('/');
	}

	const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';

	async function createLab() {
		if (!labName.trim()) {
			error = 'Lab name is required';
			return;
		}
		busy = true; error = '';
		const res = await fetch('/api/auth/setup-lab', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: labName.trim(), slug: labSlug.trim() || undefined })
		});
		if (res.ok) {
			await invalidateAll();
			goto('/');
		} else {
			error = (await res.json().catch(() => ({}))).error || 'Failed to create lab';
			busy = false;
		}
	}

	async function joinLab() {
		// Accept a raw token OR a full URL like .../auth/join/<token>
		const raw = token.trim();
		const tk = raw.includes('/auth/join/')
			? raw.split('/auth/join/').pop()?.split(/[?#]/)[0] ?? raw
			: raw;
		if (!tk) {
			error = 'Paste an invite token or URL';
			return;
		}
		busy = true; error = '';
		const res = await fetch('/api/auth/join', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token: tk })
		});
		if (res.ok) {
			await invalidateAll();
			goto('/');
		} else {
			error = (await res.json().catch(() => ({}))).error || 'Failed to accept invite';
			busy = false;
		}
	}
</script>

<div class="max-w-lg mx-auto mt-16 space-y-6">
	<div class="text-center">
		<h1 class="text-2xl font-bold text-white">Set up your lab</h1>
		<p class="text-slate-400 mt-2 text-sm">
			Welcome! Pick how you want to get started. Free for academic and
			nonprofit use — <a href="mailto:hello@sampletown.org" class="text-ocean-400 hover:text-ocean-300">contact us</a> for enterprise.
		</p>
	</div>

	{#if error}
		<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{error}</div>
	{/if}

	{#if mode === 'choose'}
		<div class="grid gap-3">
			<button
				type="button"
				onclick={() => { mode = 'create'; error = ''; }}
				class="text-left p-4 rounded-lg border border-slate-700 hover:border-ocean-500 hover:bg-slate-800 transition-colors"
			>
				<div class="text-white font-semibold">Start a new lab</div>
				<div class="text-slate-400 text-sm mt-1">
					You'll be the admin. Picks up a fresh copy of the default
					picklists, primer sets, and PCR protocols.
				</div>
			</button>
			<button
				type="button"
				onclick={() => { mode = 'join'; error = ''; }}
				class="text-left p-4 rounded-lg border border-slate-700 hover:border-ocean-500 hover:bg-slate-800 transition-colors"
			>
				<div class="text-white font-semibold">Join an existing lab</div>
				<div class="text-slate-400 text-sm mt-1">
					Paste an invite token or invite URL from the lab admin.
					Invites only work on the SampleTown instance that issued them.
				</div>
			</button>
			<button
				type="button"
				onclick={() => { mode = 'sync'; error = ''; }}
				class="text-left p-4 rounded-lg border border-slate-700 hover:border-ocean-500 hover:bg-slate-800 transition-colors"
			>
				<div class="text-white font-semibold">Sync an existing lab onto this instance</div>
				<div class="text-slate-400 text-sm mt-1">
					Your lab already runs SampleTown elsewhere (e.g. online) and backs up
					to a GitHub repo? Pull it onto this instance and keep the two in sync.
					You'll need the lab's snapshot repo and access token from its admin.
				</div>
			</button>
		</div>
	{:else if mode === 'create'}
		<form onsubmit={(e) => { e.preventDefault(); createLab(); }} class="space-y-4">
			<div>
				<label for="lab-name" class="block text-sm text-slate-300 mb-1">Lab name</label>
				<input id="lab-name" type="text" bind:value={labName} class={inputCls}
					placeholder="e.g. McGurk Institute" />
			</div>
			<div>
				<label for="lab-slug" class="block text-sm text-slate-300 mb-1">URL slug <span class="text-slate-500 text-xs">(optional, derived from the name otherwise)</span></label>
				<input id="lab-slug" type="text" bind:value={labSlug} class={inputCls}
					placeholder="e.g. mcgurk-institute" />
			</div>
			<div class="flex gap-3 pt-2">
				<button type="submit" disabled={busy}
					class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">
					{busy ? 'Creating…' : 'Create lab'}
				</button>
				<button type="button" onclick={() => { mode = 'choose'; error = ''; }}
					class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">
					Back
				</button>
			</div>
		</form>
	{:else if mode === 'sync'}
		{#if syncWarning}
			<div class="space-y-4">
				<div class="p-3 rounded-lg bg-amber-900/20 border border-amber-800 text-amber-300 text-sm">{syncWarning}</div>
				<button type="button" onclick={continueAfterWarning}
					class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">
					Continue
				</button>
			</div>
		{:else}
		<form onsubmit={(e) => { e.preventDefault(); syncLabs === null ? probeSyncRepo() : syncExistingLab(); }} class="space-y-4">
			<div>
				<label for="sync-repo" class="block text-sm text-slate-300 mb-1">Snapshot repo</label>
				<input id="sync-repo" type="text" bind:value={syncRepo} class={inputCls}
					placeholder="owner/repository-name" />
				<p class="text-xs text-slate-500 mt-1">
					The GitHub repo the lab backs up to — shown in the lab's
					Settings → Backup on the other instance.
				</p>
			</div>
			<div>
				<label for="sync-token" class="block text-sm text-slate-300 mb-1">GitHub access token</label>
				<input id="sync-token" type="password" bind:value={syncToken} autocomplete="new-password"
					class={inputCls} placeholder="github_pat_… (Contents: read & write on the repo)" />
				<p class="text-xs text-slate-500 mt-1">
					Needs read <em>and</em> write on the repo's contents — this instance
					pulls the lab's data and pushes its own changes back.
				</p>
			</div>

			{#if syncLabs !== null}
				{#if syncLabs.length === 0}
					<p class="text-sm text-amber-300">
						The repo is reachable but holds no lab snapshots yet. Run a backup
						from the other instance first (Settings → Backup → Backup now).
					</p>
				{:else}
					<fieldset>
						<legend class="block text-sm text-slate-300 mb-1">Lab to sync</legend>
						<div class="space-y-1">
							{#each syncLabs as l}
								<label class="flex items-center gap-2 text-sm {l.taken ? 'text-slate-600' : 'text-slate-200 cursor-pointer'}">
									<input type="radio" name="sync-slug" value={l.slug} disabled={l.taken}
										checked={syncSlug === l.slug} onchange={() => selectSyncSlug(l.slug)}
										class="accent-ocean-500" />
									<code>{l.slug}</code>
									{#if l.taken}<span class="text-xs">— already on this instance: ask its admin here for access; it can be linked to the repo from its Settings → Backup</span>{/if}
								</label>
							{/each}
						</div>
					</fieldset>
					{#if syncSlug}
						<div>
							<label for="sync-name" class="block text-sm text-slate-300 mb-1">Display name for this lab</label>
							<input id="sync-name" type="text" bind:value={syncName} class={inputCls} />
						</div>
					{/if}
				{/if}
			{/if}

			<div class="flex gap-3 pt-2">
				{#if syncLabs === null}
					<button type="submit" disabled={busy || !syncRepo.trim() || !syncToken.trim()}
						class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">
						{busy ? 'Checking repo…' : 'Find labs'}
					</button>
				{:else}
					<button type="submit" disabled={busy || !syncSlug}
						class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">
						{busy ? 'Pulling lab data…' : 'Sync this lab'}
					</button>
					<button type="button" onclick={() => { syncLabs = null; syncSlug = ''; error = ''; }}
						class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">
						Change repo
					</button>
				{/if}
				<button type="button" onclick={() => { mode = 'choose'; error = ''; }}
					class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">
					Back
				</button>
			</div>
		</form>
		{/if}
	{:else if mode === 'join'}
		<form onsubmit={(e) => { e.preventDefault(); joinLab(); }} class="space-y-4">
			<div>
				<label for="invite-token" class="block text-sm text-slate-300 mb-1">Invite token or URL</label>
				<input id="invite-token" type="text" bind:value={token} class={inputCls}
					placeholder="Paste the invite link from your lab admin" />
				<p class="text-xs text-slate-500 mt-1">Both the bare token and a full URL like <code>https://edna.sampletown.org/auth/join/abc…</code> work.</p>
			</div>
			<div class="flex gap-3 pt-2">
				<button type="submit" disabled={busy}
					class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">
					{busy ? 'Joining…' : 'Accept invite'}
				</button>
				<button type="button" onclick={() => { mode = 'choose'; error = ''; }}
					class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">
					Back
				</button>
			</div>
		</form>
	{/if}

	<div class="text-center pt-4 border-t border-slate-800">
		<form method="POST" action="/auth/logout" class="inline">
			<button type="submit" class="text-xs text-slate-500 hover:text-slate-300">Sign out</button>
		</form>
	</div>
</div>
