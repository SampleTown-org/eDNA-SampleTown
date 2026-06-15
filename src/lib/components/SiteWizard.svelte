<!--
  Inline site-creation sub-wizard (docs/dev/offline-pwa.md, #5).

  Same one-question-per-page engine as the sample wizard (shared WizardMachine),
  shown as a full-screen overlay. Captures site identity + GPS (device
  geolocation with a map-pin confirm / manual fallback) and POSTs /api/sites,
  then hands the created row back to the parent so the sample flow can select
  it. Online for now; the offline-site client_id path is #3.
-->
<script lang="ts">
	import MapPicker from '$lib/components/MapPicker.svelte';
	import GlossaryDoc from '$lib/components/GlossaryDoc.svelte';
	import { formatLatLon } from '$lib/mixs/validators';
	import type { Picklists } from '$lib/mixs/sample-form';
	import { buildSiteQueue, isAnswered, isValid, type WizardQuestion } from '$lib/wizard/queue';
	import { WizardMachine } from '$lib/wizard/machine.svelte';
	import { enqueueSite, genClientId } from '$lib/offline/outbox';

	interface Props {
		projectId: string;
		projectName: string;
		picklists: Picklists;
		/** `pending` = site is only in the offline outbox, not yet on the server.
		 *  The parent must then queue any sample referencing it (so the site
		 *  flushes first) instead of POSTing the sample directly. */
		oncreated: (site: { id: string; site_name: string; project_id: string }, pending: boolean) => void;
		oncancel: () => void;
	}
	let { projectId, projectName, picklists, oncreated, oncancel }: Props = $props();

	let queue = $derived(buildSiteQueue(picklists));
	let answers = $state<Record<string, string>>({});
	let lat = $state<number | null>(null);
	let lon = $state<number | null>(null);
	let accuracy = $state<number | null>(null);
	let altitude = $state<number | null>(null);
	let geoErr = $state('');
	let locating = $state(false);

	const m = new WizardMachine(() => queue);
	let current = $derived(m.current);
	let phase = $derived(m.phase);

	let saving = $state(false);
	let errorMsg = $state('');

	function valueFor(q: WizardQuestion): unknown {
		if (q.widget === 'gps') return lat != null && lon != null ? 'set' : '';
		return answers[q.key] ?? '';
	}
	let currentValid = $derived(current ? isValid(current, valueFor(current)) : false);
	const answeredCount = $derived(queue.filter((q) => isAnswered(q, valueFor(q))).length);

	function clearAnswer(q: WizardQuestion) {
		if (q.widget === 'gps') {
			lat = lon = accuracy = altitude = null;
			return;
		}
		const next = { ...answers };
		delete next[q.key];
		answers = next;
	}

	function locate() {
		geoErr = '';
		if (!('geolocation' in navigator)) {
			geoErr = 'This device has no geolocation.';
			return;
		}
		locating = true;
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				lat = +pos.coords.latitude.toFixed(6);
				lon = +pos.coords.longitude.toFixed(6);
				accuracy = pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : null;
				altitude = pos.coords.altitude != null ? Math.round(pos.coords.altitude) : null;
				locating = false;
			},
			(err) => {
				geoErr = err.message || 'Could not get a fix.';
				locating = false;
			},
			{ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
		);
	}

	function tryComplete() {
		const missing = queue.filter((q) => q.required && !isAnswered(q, valueFor(q)));
		if (missing.length > 0) {
			m.reset(queue.indexOf(missing[0]));
			return;
		}
		m.toReview();
	}

	async function save() {
		errorMsg = '';
		if (!answers.site_name?.trim()) {
			m.reset(0);
			return;
		}
		saving = true;
		const clientId = genClientId();
		const body: Record<string, unknown> = {
			project_id: projectId,
			site_name: answers.site_name.trim(),
			geo_loc_name: answers.geo_loc_name || null,
			locality: answers.locality || null,
			env_broad_scale: answers.env_broad_scale || null,
			env_local_scale: answers.env_local_scale || null,
			access_notes: answers.description || null
		};
		if (lat != null && lon != null) {
			body.latitude = lat;
			body.longitude = lon;
			body.lat_lon = formatLatLon(lat, lon);
		}

		// Offline: queue the site and return it provisionally. Its clientId is the
		// id the server will adopt, so the sample that selects it references the
		// same id — sites flush before samples (#3).
		async function queueOffline() {
			await enqueueSite({ clientId, projectId, body, createdAt: new Date().toISOString() });
			saving = false;
			oncreated({ id: clientId, site_name: body.site_name as string, project_id: projectId }, true);
		}

		if (typeof navigator !== 'undefined' && !navigator.onLine) {
			await queueOffline();
			return;
		}
		try {
			const res = await fetch('/api/sites', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: clientId, ...body })
			});
			saving = false;
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				errorMsg = err.error ?? `HTTP ${res.status}`;
				return;
			}
			const site = (await res.json()) as { id: string; site_name: string; project_id: string };
			oncreated(site, false);
		} catch {
			await queueOffline();
		}
	}

	const inputCls =
		'w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white text-lg focus:outline-none focus:border-ocean-500';
</script>

<div class="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur overflow-y-auto">
	<div class="max-w-xl mx-auto p-4 space-y-4 pb-8">
		<div class="flex items-center justify-between">
			<h1 class="text-lg font-bold text-white">New site{projectName ? ` · ${projectName}` : ''}</h1>
			<button type="button" onclick={oncancel} class="text-sm text-slate-400 hover:text-red-400">Cancel</button>
		</div>

		<!-- Action bar — sticky at top so the on-screen keyboard never hides the controls. -->
		<div class="sticky top-0 z-10 -mx-4 px-4 py-2 bg-slate-950/95 backdrop-blur border-b border-slate-800">
			<div class="flex items-center gap-3">
				<button type="button" onclick={() => m.back()} disabled={!m.canGoBack}
					class="px-4 py-3 border border-slate-700 text-slate-300 rounded-lg disabled:opacity-30 hover:bg-slate-800">Back</button>
				{#if phase === 'review'}
					<button type="button" onclick={save} disabled={saving}
						class="flex-1 px-4 py-3 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 font-medium">
						{saving ? 'Saving…' : 'Create site'}
					</button>
				{:else}
					<button type="button" onclick={() => m.advance(currentValid, clearAnswer)}
						class="flex-1 px-4 py-3 rounded-lg font-medium {currentValid ? 'bg-ocean-600 text-white hover:bg-ocean-500' : 'border border-slate-700 text-slate-300 hover:bg-slate-800'}">
						{currentValid ? 'Next' : 'Skip'}
					</button>
					<button type="button" onclick={tryComplete}
						class="px-4 py-3 border border-green-700 text-green-300 rounded-lg hover:bg-slate-800 font-medium">Complete</button>
				{/if}
			</div>
		</div>

		<div class="h-1.5 rounded-full bg-slate-800 overflow-hidden">
			<div class="h-full bg-ocean-500 transition-all" style:width="{Math.round((answeredCount / Math.max(queue.length, 1)) * 100)}%"></div>
		</div>

		{#if errorMsg}
			<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>
		{/if}

		{#if phase === 'review'}
			<div class="space-y-3">
				<h2 class="text-xl font-bold text-white">Review site</h2>
				<ul class="divide-y divide-slate-800 rounded-lg border border-slate-800">
					{#each queue as q}
						{@const answered = isAnswered(q, valueFor(q))}
						<li class="flex items-center gap-3 px-3 py-2">
							<div class="flex-1 min-w-0">
								<p class="text-xs text-slate-500">{q.label}{q.required ? ' *' : ''}</p>
								<p class="text-sm {answered ? 'text-white' : 'text-slate-600 italic'} truncate">
									{#if q.widget === 'gps'}{lat != null && lon != null ? `${lat}, ${lon}${accuracy != null ? ` (±${accuracy} m)` : ''}` : 'not set'}
									{:else}{answered ? answers[q.key] : 'skipped'}{/if}
								</p>
							</div>
							<button type="button" onclick={() => m.jumpToIndex(queue.indexOf(q))} class="text-xs text-ocean-400 hover:text-ocean-300 shrink-0">Edit</button>
						</li>
					{/each}
				</ul>
			</div>
		{:else if current}
			<div class="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-5">
				<div class="flex items-center gap-2">
					<h2 class="text-xl font-bold text-white">{current.label}</h2>
					{#if current.required}<span class="text-rose-400">*</span>{:else if current.recommended}<span class="text-amber-400">*</span>{/if}
					{#if current.slot}<GlossaryDoc slot={current.slot} iconOnly />{/if}
				</div>

				{#if current.widget === 'gps'}
					<div class="space-y-3">
						<button type="button" onclick={locate} disabled={locating}
							class="inline-flex items-center gap-2 px-4 py-3 rounded-lg bg-ocean-600 text-white hover:bg-ocean-500 disabled:opacity-50">
							{locating ? 'Locating…' : '📍 Use my location'}
						</button>
						{#if geoErr}<p class="text-sm text-red-400">{geoErr}</p>{/if}
						{#if lat != null && lon != null}
							<p class="text-sm text-slate-300">{lat}, {lon}{accuracy != null ? ` · ±${accuracy} m` : ''}{altitude != null ? ` · ${altitude} m alt` : ''}</p>
							<MapPicker bind:latitude={lat} bind:longitude={lon} height="220px" showNativeLand={false} onchange={(la, lo) => { lat = +la.toFixed(6); lon = +lo.toFixed(6); accuracy = null; }} />
						{/if}
						<div class="grid grid-cols-2 gap-2">
							<input type="number" step="any" inputmode="decimal" placeholder="latitude" value={lat ?? ''} onchange={(e) => (lat = e.currentTarget.value ? +e.currentTarget.value : null)} class={inputCls} />
							<input type="number" step="any" inputmode="decimal" placeholder="longitude" value={lon ?? ''} onchange={(e) => (lon = e.currentTarget.value ? +e.currentTarget.value : null)} class={inputCls} />
						</div>
					</div>
				{:else if current.widget === 'select'}
					<select bind:value={answers[current.key]} class={inputCls}>
						<option value="">Select…</option>
						{#each current.options ?? [] as o}<option value={o.value}>{o.label}</option>{/each}
					</select>
				{:else if current.widget === 'textarea'}
					<textarea bind:value={answers[current.key]} placeholder={current.placeholder} rows="3" class={inputCls}></textarea>
				{:else}
					<input type="text" bind:value={answers[current.key]} placeholder={current.placeholder} class={inputCls} />
				{/if}
			</div>
		{/if}
	</div>
</div>
