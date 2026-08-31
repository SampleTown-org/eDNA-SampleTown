<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	let { data } = $props();

	let errorParam = $derived($page.url.searchParams.get('error'));
	let nextParam = $derived($page.url.searchParams.get('next') ?? '');
	let formAction = $derived(nextParam ? `/auth/login/local?next=${encodeURIComponent(nextParam)}` : '/auth/login/local');
	let errorMsg = $derived(
		errorParam === 'invalid_credentials' ? 'Invalid username or password.' :
		errorParam === 'missing_credentials' ? 'Please enter username and password.' :
		errorParam === 'rate_limited' ? 'Too many login attempts, please wait and try again.' :
		errorParam === 'github_not_configured' ? 'GitHub OAuth is not configured. Use local login.' :
		''
	);

	// --- GitHub device flow ---------------------------------------------
	// The server holds the device_code; we get a user code to show, then
	// poll until the person approves it on github.com from any device.
	type DeviceState = 'idle' | 'starting' | 'waiting' | 'error';
	let device = $state<{
		status: DeviceState;
		userCode: string;
		verificationUri: string;
		error: string;
	}>({ status: 'idle', userCode: '', verificationUri: '', error: '' });
	let pollTimer: ReturnType<typeof setTimeout> | null = null;

	async function startDeviceLogin() {
		device = { status: 'starting', userCode: '', verificationUri: '', error: '' };
		try {
			const res = await fetch('/auth/login/github/device', { method: 'POST' });
			const body = await res.json().catch(() => null);
			if (!res.ok || !body?.user_code) {
				throw new Error(body?.error || `Could not start GitHub login (${res.status})`);
			}
			device = {
				status: 'waiting',
				userCode: body.user_code,
				verificationUri: body.verification_uri,
				error: ''
			};
			schedulePoll(body.interval ?? 5);
		} catch (e) {
			device = {
				status: 'error',
				userCode: '',
				verificationUri: '',
				error: e instanceof Error ? e.message : String(e)
			};
		}
	}

	function schedulePoll(intervalSec: number) {
		if (pollTimer) clearTimeout(pollTimer);
		pollTimer = setTimeout(poll, Math.max(intervalSec, 3) * 1000);
	}

	async function poll() {
		if (device.status !== 'waiting') return;
		try {
			const res = await fetch('/auth/login/github/device/poll', { method: 'POST' });
			const body = await res.json().catch(() => null);
			switch (body?.status) {
				case 'ok':
					await goto(nextParam || '/', { invalidateAll: true });
					return;
				case 'pending':
					schedulePoll(body.intervalSec ?? 5);
					return;
				case 'denied':
					device = { status: 'error', userCode: '', verificationUri: '', error: 'GitHub sign-in was denied.' };
					return;
				case 'expired':
					device = { status: 'error', userCode: '', verificationUri: '', error: 'The code expired. Start again.' };
					return;
				default:
					device = {
						status: 'error', userCode: '', verificationUri: '',
						error: body?.message || 'GitHub sign-in failed. Start again.'
					};
			}
		} catch {
			// Transient network hiccup — keep waiting.
			schedulePoll(5);
		}
	}

	$effect(() => () => { if (pollTimer) clearTimeout(pollTimer); });
</script>

{#snippet githubMark()}
	<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
		<path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
	</svg>
{/snippet}

<div class="max-w-sm mx-auto mt-20 space-y-6">
	<div class="text-center">
		<h1 class="text-2xl font-bold text-white">Sign in to SampleTown</h1>
		{#if data.githubWeb || data.githubDevice}
			<p class="text-slate-400 mt-1 text-sm">
				New here? <span class="text-slate-300">Sign in with GitHub</span> — you'll be prompted to start a new lab or accept an invite.
			</p>
		{/if}
	</div>

	{#if errorMsg}
		<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>
	{/if}

	<div class="space-y-3">
		{#if data.githubWeb}
			<a
				href="/auth/login/github"
				class="flex items-center justify-center gap-2 w-full px-4 py-3 bg-slate-800 border border-slate-700 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm font-medium"
			>
				{@render githubMark()}
				Sign in with GitHub
			</a>
		{:else if data.githubDevice}
			{#if device.status === 'idle' || device.status === 'starting'}
				<button
					type="button"
					onclick={startDeviceLogin}
					disabled={device.status === 'starting'}
					class="flex items-center justify-center gap-2 w-full px-4 py-3 bg-slate-800 border border-slate-700 text-white rounded-lg hover:bg-slate-700 transition-colors text-sm font-medium disabled:opacity-50"
				>
					{@render githubMark()}
					{device.status === 'starting' ? 'Contacting GitHub…' : 'Sign in with GitHub'}
				</button>
			{:else if device.status === 'waiting'}
				<div class="p-4 rounded-lg bg-slate-800/70 border border-slate-700 space-y-3 text-center">
					<p class="text-sm text-slate-300">
						On any device, open
						<a href={device.verificationUri} target="_blank" rel="noopener noreferrer"
							class="text-ocean-400 hover:text-ocean-300 underline">{device.verificationUri.replace('https://', '')}</a>
						and enter:
					</p>
					<div class="font-mono text-2xl tracking-[0.2em] text-white bg-slate-900 border border-slate-600 rounded-lg px-4 py-2 select-all inline-block"
					>{device.userCode}</div>
					<p class="text-xs text-slate-500">Waiting for GitHub approval…</p>
				</div>
			{:else}
				<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm space-y-2">
					<p>{device.error}</p>
					<button type="button" onclick={startDeviceLogin}
						class="text-ocean-400 hover:text-ocean-300 underline">Try again</button>
				</div>
			{/if}
		{/if}

		{#if data.localForm}
			{#if data.githubWeb || data.githubDevice}
				<div class="relative">
					<div class="absolute inset-0 flex items-center"><div class="w-full border-t border-slate-800"></div></div>
					<div class="relative flex justify-center text-xs"><span class="bg-slate-950 px-2 text-slate-500">or</span></div>
				</div>
			{/if}

			<form action={formAction} method="POST" class="space-y-3">
				<input
					name="username"
					type="text"
					required
					placeholder="Username"
					value="guest"
					class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500"
				/>
				<input
					name="password"
					type="password"
					required
					placeholder="Password"
					value="guest"
					class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500"
				/>
				<button
					type="submit"
					class="w-full px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium"
				>
					Sign In
				</button>
			</form>

			<div class="p-3 rounded-lg bg-slate-800/50 border border-slate-700 text-sm">
				<p class="text-slate-300 font-medium">Try it out</p>
				<p class="text-slate-400 mt-1">
					The demo account (<span class="text-white">guest / guest</span>) is pre-filled above.
					It has read/write access to the McGurk Institute lab, which is loaded with
					sample data inspired by Sinclair Lewis's <em>Arrowsmith</em>.
				</p>
			</div>
		{/if}
	</div>

	<p class="text-xs text-slate-500 text-center">
		New to SampleTown? <a href="/tour" class="text-ocean-400 hover:text-ocean-300">Take the tour</a> to see how it works.
	</p>

	<p class="text-xs text-slate-500 text-center pt-4 border-t border-slate-800">
		Free for academic and nonprofit use. <a href="mailto:hello@sampletown.org" class="text-ocean-400 hover:text-ocean-300">Contact us</a> for enterprise.
	</p>
</div>
