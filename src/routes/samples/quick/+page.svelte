<!--
  Offline field-capture quick — one question per page (docs/dev/offline-pwa.md).

  Traversal (Skip↔Next, skip-loop second pass, review) lives in the shared
  QuickMachine (src/lib/quick/machine.svelte.ts); this page owns answer state
  and rendering. The action button reads "Skip" while the current answer is
  empty/invalid and flips to "Next" once it's valid; "Complete" is always
  present and enforces MIxS-required fields before finalizing.

  Online-only for now; the IndexedDB outbox + service worker (#2/#3) layer on
  top of finalize() without changing this flow.
-->
<script lang="ts">
	import PeoplePicker from '$lib/components/PeoplePicker.svelte';
	import GlossaryDoc from '$lib/components/GlossaryDoc.svelte';
	import SiteQuick from '$lib/components/SiteQuick.svelte';
	import TemplateBuilder from '$lib/components/TemplateBuilder.svelte';
	import { CHECKLIST_OPTIONS, EXTENSION_OPTIONS } from '$lib/mixs/checklists';
	import { sanitizeMiscParamName, MISC_PARAM_PREFIX, type Picklists } from '$lib/mixs/sample-form';
	import { getSlot } from '$lib/mixs/schema-index';
	import { buildSampleQueue, isAnswered, isValid, availableSlots, questionForKey, suggestedExtraKeys, type QuickQuestion, type TemplateParam } from '$lib/quick/queue';
	import { QuickMachine } from '$lib/quick/machine.svelte';
	import { enqueueSample, flush, genClientId, pendingCount } from '$lib/offline/outbox';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const picklists = data.picklists as Picklists;

	let checklist = $state('MimarksS');
	let extension = $state('Water');

	// Templates (docs/dev/offline-pwa.md). selectedParams === null → the built-in
	// default (required-only). A custom template supplies its own ordered params.
	type Template = { id: string; name: string; description?: string | null; mixs_checklist: string; extension: string | null; params: string };
	let templates = $derived((data.templates as Template[]) ?? []);
	let selectedParams = $state<TemplateParam[] | null>(null);
	let templateChosen = $state(false);
	let templateName = $state('Default — required only');
	let fromTemplate = $state<Set<string>>(new Set());
	let extraKeys = $state<string[]>([]);
	let showBuilder = $state(false);

	let queue = $derived(buildSampleQueue(checklist, extension, picklists, selectedParams ?? undefined));

	// Loaders return loosely-typed rows; pin the shapes the template needs.
	let projects = $derived(data.projects as { id: string; project_name: string }[]);
	type SiteRow = { id: string; site_name: string; project_id: string; latitude: number | null; longitude: number | null };
	let allSites = $state((data.sites as SiteRow[]) ?? []);

	// Answer state. Scalar answers live in `answers`; people/photos are arrays.
	let answers = $state<Record<string, string>>({});
	let people = $state<{ personnel_id: string; role?: string | null }[]>([]);
	let photos = $state<{ file: File; caption: string }[]>([]);

	const m = new QuickMachine(() => queue);
	let current = $derived(m.current);
	let phase = $derived(m.phase);

	// Seed preselected project/site from the query string (scan / deep-link).
	$effect(() => {
		if (data.preselectedProjectId && !answers.project_id) answers.project_id = data.preselectedProjectId;
		if (data.preselectedSiteId && !answers.site_id) answers.site_id = data.preselectedSiteId;
	});

	let saving = $state(false);
	let errorMsg = $state('');
	let successMsg = $state('');
	let missingRequired = $state<QuickQuestion[]>([]);
	let showSiteQuick = $state(false);
	let pending = $state({ sites: 0, samples: 0 });
	let syncing = $state(false);

	async function refreshPending() {
		try {
			pending = await pendingCount();
		} catch {
			/* IndexedDB unavailable (private mode) — ignore */
		}
	}

	async function syncNow() {
		if (syncing) return;
		syncing = true;
		try {
			const r = await flush();
			if (r.synced > 0) successMsg = `Synced ${r.synced} queued record(s).`;
			if (r.failed > 0) errorMsg = `${r.failed} queued record(s) were rejected — open them to fix.`;
		} catch {
			/* ignore */
		}
		await refreshPending();
		// Queued sites are now real rows — stop force-queueing samples for them.
		if (pending.sites === 0) offlineSiteIds = new Set();
		syncing = false;
	}

	onMount(() => {
		refreshPending();
		if (navigator.onLine) syncNow();
		const onOnline = () => syncNow();
		window.addEventListener('online', onOnline);
		return () => window.removeEventListener('online', onOnline);
	});

	function valueFor(q: QuickQuestion): unknown {
		if (q.widget === 'people') return people;
		if (q.widget === 'photos') return photos;
		return answers[q.key] ?? '';
	}

	// Duplicate sample-name detection. Matches UNIQUE(project_id, samp_name)
	// exactly: case-sensitive, and including soft-deleted rows (loader snapshot
	// + live endpoint both ignore is_deleted, since a deleted sample still
	// reserves its name). existingNames = instant/offline snapshot;
	// nameTakenRemote = authoritative server check (debounced); savedNames =
	// names created this session.
	let existingNames = $derived(
		new Set((data.sampleNames as { project_id: string; samp_name: string }[]).map((r) => `${r.project_id}|${r.samp_name.trim()}`))
	);
	let savedNames = $state<Set<string>>(new Set());
	let nameTakenRemote = $state(false);
	let nameCheckTimer: ReturnType<typeof setTimeout> | undefined;
	$effect(() => {
		const name = answers.samp_name?.trim();
		const proj = answers.project_id;
		nameTakenRemote = false;
		if (!name || !proj) return;
		clearTimeout(nameCheckTimer);
		nameCheckTimer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/samples/check-name?project_id=${encodeURIComponent(proj)}&samp_name=${encodeURIComponent(name)}`);
				if (res.ok) {
					const { taken } = await res.json();
					// Only apply if the field hasn't changed since the request fired.
					if (answers.samp_name?.trim() === name && answers.project_id === proj) nameTakenRemote = taken;
				}
			} catch {
				/* offline — rely on the loaded snapshot */
			}
		}, 300);
	});
	let nameTaken = $derived.by(() => {
		const n = answers.samp_name?.trim();
		if (!n || !answers.project_id) return false;
		const key = `${answers.project_id}|${n}`;
		return existingNames.has(key) || savedNames.has(key) || nameTakenRemote;
	});

	let currentAnswered = $derived(current ? isAnswered(current, valueFor(current)) : false);
	let currentValid = $derived.by(() => {
		if (!current) return false;
		if (!isValid(current, valueFor(current))) return false;
		if (current.key === 'samp_name' && nameTaken) return false;
		return true;
	});
	/** Inline, as-you-go message for the current question when its value is
	 *  present but not acceptable — shown under the field so problems surface
	 *  here, not at save. */
	let currentError = $derived.by(() => {
		if (!current || !currentAnswered) return '';
		if (current.key === 'samp_name' && nameTaken) return `A sample named “${answers.samp_name}” already exists in this project — pick a different name.`;
		if (!isValid(current, valueFor(current))) {
			if (current.widget === 'number') return 'Enter a number.';
			if (current.widget === 'date') return 'Enter a valid date (YYYY-MM-DD).';
			if (current.widget === 'datetime') return 'Enter a valid date & time.';
			if (current.widget === 'select' || current.widget === 'env_medium') return 'Pick a value from the list.';
			return 'That value isn’t valid.';
		}
		return '';
	});
	/** Non-blocking MIxS "value + unit" nudge: shows the expected form from the
	 *  glossary (the slot's own example, else its number+unit pattern) when a
	 *  measurement slot that wants units got a bare number. Used for the current
	 *  question and for each Add-parameters extra. Never gates Next/Complete. */
	function unitSuggestion(slot: string | undefined, value: unknown): string {
		if (!slot || value == null) return '';
		const meta = getSlot(slot);
		if (!meta?.structured_pattern?.includes('{text}')) return '';
		if (!/^\s*-?\d*\.?\d+\s*$/.test(String(value))) return '';
		const eg = meta.examples?.[0];
		return eg
			? `MIxS expects a value with its unit — e.g. “${eg}”.`
			: 'MIxS expects a value with its unit (number + unit, e.g. “5 m”).';
	}
	let currentSuggestion = $derived(
		current && currentAnswered && !currentError ? unitSuggestion(current.slot, answers[current.key]) : ''
	);
	const answeredCount = $derived(queue.filter((q) => isAnswered(q, valueFor(q))).length);

	/** Second-pass skip → blank any partial value so review shows it empty. */
	function clearAnswer(q: QuickQuestion) {
		if (q.widget === 'people' || q.widget === 'photos') return;
		const next = { ...answers };
		delete next[q.key];
		answers = next;
	}

	/** Complete: jump to the first unfilled required field, then to any
	 *  present-but-invalid blocker (e.g. a duplicate sample name) — so Complete
	 *  can't bypass the per-field validation and hit a save-time error. */
	function tryComplete() {
		const missing = queue.filter((q) => q.required && !isAnswered(q, valueFor(q)));
		if (missing.length > 0) {
			missingRequired = missing;
			// jumpToIndex (not reset) so Back still works after a premature Complete.
			m.jumpToIndex(queue.indexOf(missing[0]));
			return;
		}
		missingRequired = [];
		if (nameTaken) {
			// Duplicate name — surface it at the field instead of failing at save.
			m.jumpToIndex(queue.findIndex((q) => q.key === 'samp_name'));
			return;
		}
		m.toReview();
	}

	function jumpTo(q: QuickQuestion) {
		m.jumpToIndex(queue.indexOf(q));
	}

	function resetForNext(carry: boolean) {
		const carried: Record<string, string> = {};
		if (carry) {
			for (const q of queue) {
				if (q.carryForward && answers[q.key]) carried[q.key] = answers[q.key];
			}
		}
		// Re-apply the template's pre-fills for the next sample, then overlay any
		// carried-forward values on top.
		seedFromParams(selectedParams ?? []);
		answers = { ...answers, ...carried };
		if (!carry) people = [];
		photos = [];
		m.reset(carry ? queue.findIndex((q) => q.key === 'samp_name') : 0);
		missingRequired = [];
	}

	/** Sites that exist only in the offline outbox. A sample referencing one of
	 *  these must be queued (not POSTed), so the site flushes first and the FK
	 *  resolves. Cleared once a flush drains all queued sites. */
	let offlineSiteIds = $state<Set<string>>(new Set());

	function onSiteCreated(
		site: { id: string; site_name: string; project_id: string; latitude?: number | null; longitude?: number | null },
		pending: boolean
	) {
		allSites = [...allSites, { ...site, latitude: site.latitude ?? null, longitude: site.longitude ?? null }];
		answers.site_id = site.id;
		if (pending) offlineSiteIds = new Set([...offlineSiteIds, site.id]);
		showSiteQuick = false;
	}

	// --- Template selection (Step 0) ---
	/** Seed answers from a template's pre-fills (preserving any project/site
	 *  already chosen), and record which keys came from the template. */
	function seedFromParams(params: TemplateParam[]) {
		const seeded: Record<string, string> = {};
		if (answers.project_id) seeded.project_id = answers.project_id;
		if (answers.site_id) seeded.site_id = answers.site_id;
		const ft = new Set<string>();
		for (const p of params) {
			if (p.value != null && p.value !== '') {
				seeded[p.key] = p.value;
				ft.add(p.key);
			}
		}
		answers = seeded;
		fromTemplate = ft;
		extraKeys = [];
	}
	function chooseDefault() {
		selectedParams = null;
		templateName = 'Default — required only';
		seedFromParams([]);
		templateChosen = true;
		m.reset(0);
	}
	function chooseTemplate(t: Template) {
		checklist = t.mixs_checklist;
		extension = t.extension ?? '';
		selectedParams = JSON.parse(t.params) as TemplateParam[];
		templateName = t.name;
		seedFromParams(selectedParams);
		templateChosen = true;
		m.reset(0);
	}
	function onTemplateCreated(t: Template) {
		showBuilder = false;
		chooseTemplate(t);
	}

	// --- "Add parameters" screen ---
	let addExtraKey = $state('');
	let addMiscName = $state('');
	const extraExclude = $derived(
		new Set<string>([...queue.map((q) => q.key), ...extraKeys, 'project_id', 'site_id', 'samp_name', 'collection_date', 'env_medium'])
	);
	const extraSlotChoices = $derived(availableSlots(checklist, extension || null, extraExclude));
	const extraSuggestions = $derived(suggestedExtraKeys(checklist, extension || null, extraExclude));
	const extraQuestions = $derived(extraKeys.map((k) => questionForKey(k, picklists, { required: false, recommended: false })));

	function addExtra(key: string) {
		if (!key || extraExclude.has(key)) return;
		extraKeys = [...extraKeys, key];
		if (answers[key] == null) answers[key] = '';
		addExtraKey = '';
	}
	function addMiscExtra() {
		const n = sanitizeMiscParamName(addMiscName);
		if (!n) return;
		addExtra(`${MISC_PARAM_PREFIX}${n}`);
		addMiscName = '';
	}
	function removeExtra(key: string) {
		extraKeys = extraKeys.filter((k) => k !== key);
		const next = { ...answers };
		delete next[key];
		answers = next;
	}

	async function finalize(addAnother: boolean) {
		errorMsg = '';
		successMsg = '';
		const missing = queue.filter((q) => q.required && !isAnswered(q, valueFor(q)));
		if (missing.length > 0) {
			missingRequired = missing;
			tryComplete();
			return;
		}
		saving = true;
		// Client-generated id doubles as the server PK (idempotent re-POST + lets
		// an offline sample reference an offline site by the same id).
		const clientId = genClientId();
		const body: Record<string, unknown> = {
			id: clientId,
			project_id: answers.project_id,
			site_id: answers.site_id,
			samp_name: answers.samp_name?.trim(),
			collection_date: answers.collection_date,
			env_medium: answers.env_medium,
			mixs_checklist: checklist,
			extension: extension || null,
			people
		};
		// Every answered parameter — template pre-fills, walked questions, and
		// Add-parameters extras — lives in `answers`; ship all the non-core ones.
		// (A genuine 0 is kept; only null/blank is skipped.)
		const CORE = new Set(['project_id', 'site_id', 'samp_name', 'collection_date', 'env_medium']);
		for (const [k, v] of Object.entries(answers)) {
			if (CORE.has(k)) continue;
			const s = v == null ? '' : v.toString().trim();
			if (s !== '') body[k] = s;
		}
		const sampName = body.samp_name as string;
		const photoPayload = photos.map((p) => ({ name: p.file.name, type: p.file.type, caption: p.caption, blob: p.file as Blob }));

		async function queueOffline(note: string) {
			await enqueueSample({ clientId, body, photos: photoPayload, createdAt: new Date().toISOString() });
			savedNames = new Set([...savedNames, `${answers.project_id}|${sampName}`]);
			await refreshPending();
			saving = false;
			successMsg = `${note} “${sampName}” saved offline — will sync.`;
			resetForNext(addAnother);
		}

		// Queue if offline, or if the chosen site is itself still queued (so the
		// site POSTs before this sample and the FK resolves on flush).
		const siteStillQueued = offlineSiteIds.has(answers.site_id);
		if ((typeof navigator !== 'undefined' && !navigator.onLine) || siteStillQueued) {
			await queueOffline(siteStillQueued ? 'Queued (new site):' : 'Offline:');
			return;
		}
		try {
			const res = await fetch('/api/samples', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				saving = false;
				// 409 here is a UNIQUE(project_id, samp_name) clash (the id is a
				// fresh client uuid) — route the operator back to the name field.
				if (res.status === 409) {
					errorMsg = `“${sampName}” already exists in this project — pick a different sample name.`;
					m.jumpToIndex(queue.findIndex((q) => q.key === 'samp_name'));
				} else {
					errorMsg = err.error ?? `HTTP ${res.status}`;
				}
				return;
			}
			savedNames = new Set([...savedNames, `${answers.project_id}|${sampName}`]);
			for (const p of photos) {
				const fd = new FormData();
				fd.append('file', p.file);
				if (p.caption?.trim()) fd.append('caption', p.caption.trim());
				const up = await fetch(`/api/samples/${clientId}/photos`, { method: 'POST', body: fd });
				if (!up.ok) {
					const err = await up.json().catch(() => ({}));
					errorMsg = `Sample saved, but photo ${p.file.name} failed: ${err.error ?? up.status}`;
				}
			}
			saving = false;
			successMsg = `Saved “${sampName}”.`;
			resetForNext(addAnother);
		} catch {
			// Network dropped mid-request — queue for retry.
			await queueOffline('Network lost:');
		}
	}

	/** Local-time `YYYY-MM-DDTHH:mm` for the datetime-local input (#6). */
	function localDateTimeNow(): string {
		const d = new Date();
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
	}

	function sitesForProject(projectId: string): SiteRow[] {
		if (!projectId) return [];
		return allSites.filter((s) => s.project_id === projectId);
	}

	// --- Nearby-site suggestions on the site step ---
	let userLat = $state<number | null>(null);
	let userLon = $state<number | null>(null);
	let geoErr = $state('');
	let locating = $state(false);
	let geoAttempted = false;
	let siteFilter = $state('');
	let showAllSites = $state(false);

	function locateUser() {
		geoErr = '';
		if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
			geoErr = 'This device has no geolocation.';
			return;
		}
		locating = true;
		navigator.geolocation.getCurrentPosition(
			(pos) => { userLat = +pos.coords.latitude.toFixed(6); userLon = +pos.coords.longitude.toFixed(6); locating = false; },
			(err) => { geoErr = err.message || 'Could not get your location.'; locating = false; },
			{ enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
		);
	}

	// Auto-locate the first time the site step is reached.
	$effect(() => {
		if (current?.widget === 'site' && answers.project_id && userLat == null && !geoAttempted) {
			geoAttempted = true;
			locateUser();
		}
	});

	/** Great-circle distance in metres (haversine). */
	function distM(lat1: number, lon1: number, lat2: number, lon2: number): number {
		const R = 6371000;
		const toRad = (d: number) => (d * Math.PI) / 180;
		const dLat = toRad(lat2 - lat1);
		const dLon = toRad(lon2 - lon1);
		const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
		return 2 * R * Math.asin(Math.sqrt(a));
	}
	function fmtDist(m: number): string {
		return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
	}

	/** Sites in the chosen project, annotated with distance from the device and
	 *  sorted nearest-first (sites without coordinates fall to the end), then
	 *  filtered by the search box. */
	let sortedSites = $derived.by(() => {
		const f = siteFilter.trim().toLowerCase();
		const withDist = sitesForProject(answers.project_id).map((s) => ({
			...s,
			dist:
				userLat != null && userLon != null && s.latitude != null && s.longitude != null
					? distM(userLat, userLon, s.latitude, s.longitude)
					: null
		}));
		withDist.sort((a, b) => {
			if (a.dist == null && b.dist == null) return a.site_name.localeCompare(b.site_name);
			if (a.dist == null) return 1;
			if (b.dist == null) return -1;
			return a.dist - b.dist;
		});
		return f ? withDist.filter((s) => s.site_name.toLowerCase().includes(f)) : withDist;
	});

	const inputCls =
		'w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white text-lg focus:outline-none focus:border-ocean-500';
</script>

{#if showSiteQuick}
	<SiteQuick
		projectId={answers.project_id}
		projectName={projects.find((p) => p.id === answers.project_id)?.project_name ?? ''}
		picklists={data.picklists as Picklists}
		initialLat={userLat}
		initialLon={userLon}
		oncreated={onSiteCreated}
		oncancel={() => (showSiteQuick = false)}
	/>
{/if}

<div class="max-w-xl mx-auto space-y-4 pb-8">
	<div class="flex items-center justify-between">
		<a href="/samples" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Samples</a>
		{#if templateChosen}
			<button type="button" onclick={() => (templateChosen = false)} class="text-xs text-slate-400 hover:text-ocean-400">
				{templateName} <span class="text-ocean-400">· change</span>
			</button>
		{/if}
	</div>

	{#if !templateChosen}
		<!-- Step 0: choose a template — the built-in required-only default or a
		     custom one. Picking sets the MIxS combo + seeds any pre-fills. -->
		<div class="space-y-3">
			<h1 class="text-xl font-bold text-white">New sample — choose a template</h1>
			<div class="grid grid-cols-2 gap-2">
				<select bind:value={checklist} class="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm">
					{#each CHECKLIST_OPTIONS as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
				<select bind:value={extension} class="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm">
					<option value="">None</option>
					{#each EXTENSION_OPTIONS as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
			</div>
			<button type="button" onclick={chooseDefault}
				class="w-full text-left p-4 rounded-xl border border-ocean-700 bg-slate-900/40 hover:bg-slate-800">
				<div class="font-semibold text-white">Default — required only</div>
				<div class="text-xs text-slate-400">Just the MIxS-required fields for {checklist}{extension ? ` · ${extension}` : ''}; add more at the end.</div>
			</button>
			{#each templates as t}
				<button type="button" onclick={() => chooseTemplate(t)}
					class="w-full text-left p-4 rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-800">
					<div class="font-semibold text-white">{t.name}</div>
					<div class="text-xs text-slate-400">{t.description || `${t.mixs_checklist}${t.extension ? ` · ${t.extension}` : ''}`}</div>
				</button>
			{/each}
			<button type="button" onclick={() => (showBuilder = true)}
				class="w-full p-3 rounded-xl border border-dashed border-slate-700 text-ocean-300 hover:bg-slate-800 text-sm">
				+ New template
			</button>
		</div>
	{:else}

	<!-- Action bar — sticky at the TOP so the on-screen keyboard (which covers
	     the bottom of the viewport while an input is focused) never hides
	     Back / Skip / Next / Complete and there's no dismiss-keyboard step. -->
	<div class="sticky top-14 z-30 -mx-4 px-4 py-2 bg-slate-950/95 backdrop-blur border-b border-slate-800">
		<div class="flex items-center gap-3">
			<button type="button" onclick={() => m.back()} disabled={!m.canGoBack}
				class="px-4 py-3 border border-slate-700 text-slate-300 rounded-lg disabled:opacity-30 hover:bg-slate-800">Back</button>

			{#if phase === 'review'}
				<button type="button" onclick={() => finalize(true)} disabled={saving}
					class="flex-1 px-4 py-3 border border-ocean-700 text-ocean-300 rounded-lg hover:bg-slate-800 disabled:opacity-50 font-medium">
					{saving ? 'Saving…' : 'Save & add another'}
				</button>
				<button type="button" onclick={() => finalize(false)} disabled={saving}
					class="flex-1 px-4 py-3 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 font-medium">
					{saving ? 'Saving…' : 'Save'}
				</button>
			{:else}
				<!-- Empty → Skip; valid → Next; present-but-invalid → Next disabled
				     (the inline error below the field explains why). -->
				<button type="button" onclick={() => m.advance(currentValid, clearAnswer)}
					disabled={currentAnswered && !currentValid}
					class="flex-1 px-4 py-3 rounded-lg font-medium disabled:opacity-50 {currentValid ? 'bg-ocean-600 text-white hover:bg-ocean-500' : 'border border-slate-700 text-slate-300 hover:bg-slate-800'}">
					{currentAnswered || current?.widget === 'add_params' ? 'Next' : 'Skip'}
				</button>
				<button type="button" onclick={tryComplete}
					class="px-4 py-3 border border-green-700 text-green-300 rounded-lg hover:bg-slate-800 font-medium">Complete</button>
			{/if}
		</div>
	</div>

	<!-- Progress -->
	<div class="space-y-1">
		<div class="h-1.5 rounded-full bg-slate-800 overflow-hidden">
			<div class="h-full bg-ocean-500 transition-all" style:width="{Math.round((answeredCount / Math.max(queue.length, 1)) * 100)}%"></div>
		</div>
		<p class="text-xs text-slate-500 flex justify-between">
			<span>{answeredCount} / {queue.length} answered{m.skipped.length > 0 ? ` · ${m.skipped.length} skipped` : ''}</span>
			{#if phase === 'skips'}<span class="text-amber-400">Reviewing skipped</span>{/if}
		</p>
	</div>

	{#if pending.samples > 0 || pending.sites > 0}
		<div class="flex items-center gap-3 p-2.5 rounded-lg bg-amber-900/20 border border-amber-800 text-amber-200 text-sm">
			<span class="flex-1">
				{pending.samples} sample(s){pending.sites > 0 ? ` · ${pending.sites} site(s)` : ''} queued offline
			</span>
			<button type="button" onclick={syncNow} disabled={syncing}
				class="px-3 py-1.5 rounded border border-amber-700 hover:bg-amber-900/40 disabled:opacity-50">
				{syncing ? 'Syncing…' : 'Sync now'}
			</button>
		</div>
	{/if}

	{#if errorMsg}
		<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>
	{/if}
	{#if successMsg}
		<div class="p-3 rounded-lg bg-green-900/20 border border-green-800 text-green-300 text-sm">{successMsg}</div>
	{/if}

	{#if phase === 'review'}
		<!-- Review screen -->
		<div class="space-y-3">
			<h2 class="text-xl font-bold text-white">Review</h2>
			<ul class="divide-y divide-slate-800 rounded-lg border border-slate-800">
				{#each queue.filter((q) => q.widget !== 'add_params') as q}
					{@const answered = isAnswered(q, valueFor(q))}
					<li class="flex items-center gap-3 px-3 py-2">
						<div class="flex-1 min-w-0">
							<p class="text-xs text-slate-500">{q.label}{q.required ? ' *' : ''}</p>
							<p class="text-sm {answered ? 'text-white' : 'text-slate-600 italic'} truncate">
								{#if q.widget === 'people'}{people.length} person(s)
								{:else if q.widget === 'photos'}{photos.length} photo(s)
								{:else if q.widget === 'project'}{projects.find((p) => p.id === answers.project_id)?.project_name ?? '—'}
								{:else if q.widget === 'site'}{allSites.find((s) => s.id === answers.site_id)?.site_name ?? '—'}
								{:else}{answered ? answers[q.key] : (q.required ? 'Required — not set' : 'skipped')}{/if}
							</p>
						</div>
						<button type="button" onclick={() => jumpTo(q)} class="text-xs text-ocean-400 hover:text-ocean-300 shrink-0">Edit</button>
					</li>
				{/each}
				{#each extraQuestions as q (q.key)}
					<li class="flex items-center gap-3 px-3 py-2">
						<div class="flex-1 min-w-0">
							<p class="text-xs text-slate-500">{q.label}</p>
							<p class="text-sm {answers[q.key]?.toString().trim() ? 'text-white' : 'text-slate-600 italic'} truncate">{answers[q.key]?.toString().trim() || 'skipped'}</p>
						</div>
					</li>
				{/each}
			</ul>
		</div>
	{:else if current}
		<!-- Single-question card -->
		<div class="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-5 min-h-[40vh]">
			<div class="flex items-center gap-2">
				<h2 class="text-xl font-bold text-white">{current.label}</h2>
				<!-- Tier chip: explicit label + consistent color (red Required,
				     amber Suggested, slate Optional) — clearer than a bare *. -->
				{#if current.required}
					<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-rose-500/15 text-rose-300">Required</span>
				{:else if current.recommended}
					<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-300">Suggested</span>
				{:else}
					<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-slate-600/20 text-slate-400">Optional</span>
				{/if}
				{#if fromTemplate.has(current.key)}<span class="px-1.5 py-0.5 rounded text-[10px] bg-ocean-500/15 text-ocean-300">from template</span>{/if}
				{#if current.slot}<GlossaryDoc slot={current.slot} iconOnly />{/if}
			</div>
			<p class="text-xs text-slate-500 uppercase tracking-wider">{current.section}</p>

			{#if current.widget === 'project'}
				<select bind:value={answers.project_id} class={inputCls}>
					<option value="">Select project…</option>
					{#each projects as p}<option value={p.id}>{p.project_name}</option>{/each}
				</select>
			{:else if current.widget === 'site'}
				{#if !answers.project_id}
					<p class="text-amber-400 text-sm">Pick a project first.</p>
				{:else}
					<!-- Nearby-first site picker: device GPS → existing sites sorted by
					     distance; add a new one manually only if none fit. -->
					<div class="flex items-center gap-2 text-xs text-slate-400">
						{#if locating}
							<span>Finding your location…</span>
						{:else if userLat != null}
							<span>📍 Sorted by distance from you.</span>
							<button type="button" onclick={locateUser} class="text-ocean-400 hover:text-ocean-300">refresh</button>
						{:else}
							<button type="button" onclick={locateUser} class="inline-flex items-center gap-1 text-ocean-400 hover:text-ocean-300">📍 Find nearby sites</button>
						{/if}
					</div>
					{#if geoErr}<p class="text-xs text-amber-400">{geoErr} — showing all sites.</p>{/if}

					{#if sitesForProject(answers.project_id).length > 6}
						<input type="text" bind:value={siteFilter} placeholder="Filter sites…" class="{inputCls} text-base" />
					{/if}

					{#if sortedSites.length > 0}
						<ul class="space-y-1.5 max-h-[40vh] overflow-y-auto">
							{#each (showAllSites ? sortedSites : sortedSites.slice(0, 8)) as s (s.id)}
								<li>
									<button type="button" onclick={() => (answers.site_id = s.id)}
										class="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg border text-left {answers.site_id === s.id ? 'border-ocean-500 bg-ocean-900/30 text-white' : 'border-slate-700 text-slate-200 hover:bg-slate-800'}">
										<span class="truncate">{s.site_name}</span>
										{#if s.dist != null}
											<span class="shrink-0 text-xs text-slate-400">{fmtDist(s.dist)}</span>
										{:else}
											<span class="shrink-0 text-xs text-slate-600">no GPS</span>
										{/if}
									</button>
								</li>
							{/each}
						</ul>
						{#if !showAllSites && sortedSites.length > 8}
							<button type="button" onclick={() => (showAllSites = true)} class="text-xs text-ocean-400 hover:text-ocean-300">Show all {sortedSites.length} sites</button>
						{/if}
					{:else}
						<p class="text-sm text-slate-500">{siteFilter ? 'No sites match.' : 'No sites in this project yet.'}</p>
					{/if}

					<button type="button" onclick={() => (showSiteQuick = true)}
						class="mt-1 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-ocean-700 text-ocean-300 hover:bg-slate-800 text-sm">
						+ New site here (capture GPS)
					</button>
				{/if}
			{:else if current.widget === 'env_medium'}
				{#if current.options && current.options.length > 0}
					<select bind:value={answers.env_medium} class={inputCls}>
						<option value="">Select…</option>
						{#each current.options as o}<option value={o.value}>{o.label}</option>{/each}
					</select>
				{:else}
					<input type="text" bind:value={answers.env_medium} placeholder="ENVO material term" class={inputCls} />
				{/if}
			{:else if current.widget === 'people'}
				<PeoplePicker bind:people personnel={data.personnel} roleOptions={data.picklists.person_role} label="" />
			{:else if current.widget === 'photos'}
				<label class="inline-flex items-center gap-2 px-4 py-3 rounded-lg border border-slate-700 text-slate-300 cursor-pointer hover:bg-slate-800">
					<span>+ Add photo</span>
					<input type="file" accept="image/*" capture="environment" multiple class="hidden"
						onchange={(e) => { const inp = e.currentTarget; photos = [...photos, ...Array.from(inp.files ?? []).map((file) => ({ file, caption: '' }))]; inp.value = ''; }} />
				</label>
				{#if photos.length > 0}
					<ul class="space-y-2">
						{#each photos as p, i}
							<li class="space-y-1 rounded-lg border border-slate-800 p-2">
								<div class="flex items-center gap-2 text-sm text-slate-400">
									<span class="truncate flex-1">{p.file.name}</span>
									<button type="button" onclick={() => (photos = photos.filter((_, idx) => idx !== i))} class="text-slate-600 hover:text-red-400">✕</button>
								</div>
								<input type="text" bind:value={photos[i].caption} placeholder="Caption (optional)"
									class="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-white text-sm focus:outline-none focus:border-ocean-500" />
							</li>
						{/each}
					</ul>
				{/if}
			{:else if current.widget === 'date'}
				<input type="date" bind:value={answers[current.key]} class={inputCls} />
			{:else if current.widget === 'datetime'}
				<input type="datetime-local" bind:value={answers[current.key]} class={inputCls} />
				<button type="button" onclick={() => (answers[current.key] = localDateTimeNow())}
					class="mt-2 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 text-sm">
					Set to now
				</button>
			{:else if current.widget === 'select'}
				<select bind:value={answers[current.key]} class={inputCls}>
					<option value="">Select…</option>
					{#each current.options ?? [] as o}<option value={o.value}>{o.label}</option>{/each}
				</select>
			{:else if current.widget === 'number'}
				<input type="number" step="any" inputmode="decimal" bind:value={answers[current.key]} placeholder={current.placeholder} class={inputCls} />
			{:else if current.widget === 'textarea'}
				<textarea bind:value={answers[current.key]} placeholder={current.placeholder} rows="3" class={inputCls}></textarea>
			{:else if current.widget === 'add_params'}
				<p class="text-sm text-slate-400">Add any extra parameters for this sample, then tap Next.</p>
				{#if extraSuggestions.length > 0}
					<div class="flex flex-wrap gap-1.5">
						{#each extraSuggestions as s}
							<button type="button" onclick={() => addExtra(s)} class="px-2 py-1 rounded-full border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs">+ {s.startsWith(MISC_PARAM_PREFIX) ? s.slice(MISC_PARAM_PREFIX.length).replace(/_/g, ' ') : (getSlot(s)?.title ?? s)}</button>
						{/each}
					</div>
				{/if}
				<div class="flex items-center gap-2">
					<input type="text" list="extra-slots" bind:value={addExtraKey} placeholder="Search parameters…" class={inputCls}
						onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addExtra(addExtraKey); } }} />
					<datalist id="extra-slots">
						{#each extraSlotChoices as s}<option value={s}>{getSlot(s)?.title ?? s}</option>{/each}
					</datalist>
					<button type="button" onclick={() => addExtra(addExtraKey)} disabled={!extraSlotChoices.includes(addExtraKey)} class="px-3 py-3 border border-slate-700 text-slate-300 rounded-lg disabled:opacity-40">Add</button>
				</div>
				<div class="flex items-center gap-2">
					<input type="text" bind:value={addMiscName} placeholder="custom param name" class={inputCls} />
					<button type="button" onclick={addMiscExtra} disabled={!addMiscName.trim()} class="px-3 py-3 border border-slate-700 text-slate-300 rounded-lg disabled:opacity-40">Add</button>
				</div>
				{#if extraQuestions.length > 0}
					<ul class="space-y-2 pt-2 border-t border-slate-800">
						{#each extraQuestions as q (q.key)}
							{@const sug = unitSuggestion(q.slot, answers[q.key])}
							<li class="space-y-1">
								<div class="flex items-center gap-2">
									<span class="text-sm text-slate-300 flex-1">{q.label}</span>
									{#if q.slot && getSlot(q.slot)}<GlossaryDoc slot={q.slot} iconOnly />{/if}
									<button type="button" onclick={() => removeExtra(q.key)} class="text-slate-600 hover:text-red-400 text-xs">✕</button>
								</div>
								{#if q.widget === 'select'}
									<select bind:value={answers[q.key]} class={inputCls}>
										<option value="">Select…</option>
										{#each q.options ?? [] as o}<option value={o.value}>{o.label}</option>{/each}
									</select>
								{:else if q.widget === 'number'}
									<input type="number" step="any" inputmode="decimal" bind:value={answers[q.key]} placeholder={q.placeholder} class={inputCls} />
								{:else if q.widget === 'textarea'}
									<textarea bind:value={answers[q.key]} placeholder={q.placeholder} rows="2" class={inputCls}></textarea>
								{:else}
									<input type="text" bind:value={answers[q.key]} placeholder={q.placeholder} class={inputCls} />
								{/if}
								{#if sug}<p class="text-xs text-amber-400">{sug}</p>{/if}
							</li>
						{/each}
					</ul>
				{/if}
			{:else}
				<input type="text" bind:value={answers[current.key]} placeholder={current.placeholder} class={inputCls} />
			{/if}

			{#if currentError}
				<p class="text-sm text-rose-400">{currentError}</p>
			{:else if currentSuggestion}
				<p class="text-sm text-amber-400">{currentSuggestion}</p>
			{/if}
		</div>
	{/if}

	{#if missingRequired.length > 0 && phase !== 'review'}
		<p class="text-sm text-rose-400">{missingRequired.length} required field(s) still need an answer.</p>
	{/if}
	{/if}
</div>

{#if showBuilder}
	<TemplateBuilder {picklists} initialChecklist={checklist} initialExtension={extension} oncreated={onTemplateCreated} oncancel={() => (showBuilder = false)} />
{/if}

