<!--
  Offline field-capture wizard — one question per page (docs/dev/offline-pwa.md).

  Traversal (Skip↔Next, skip-loop second pass, review) lives in the shared
  WizardMachine (src/lib/wizard/machine.svelte.ts); this page owns answer state
  and rendering. The action button reads "Skip" while the current answer is
  empty/invalid and flips to "Next" once it's valid; "Complete" is always
  present and enforces MIxS-required fields before finalizing.

  Online-only for now; the IndexedDB outbox + service worker (#2/#3) layer on
  top of finalize() without changing this flow.
-->
<script lang="ts">
	import PeoplePicker from '$lib/components/PeoplePicker.svelte';
	import GlossaryDoc from '$lib/components/GlossaryDoc.svelte';
	import SiteWizard from '$lib/components/SiteWizard.svelte';
	import { CHECKLIST_OPTIONS, EXTENSION_OPTIONS } from '$lib/mixs/checklists';
	import type { Picklists } from '$lib/mixs/sample-form';
	import { buildSampleQueue, isAnswered, isValid, type WizardQuestion } from '$lib/wizard/queue';
	import { WizardMachine } from '$lib/wizard/machine.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let checklist = $state('MimarksS');
	let extension = $state('Water');

	let queue = $derived(buildSampleQueue(checklist, extension, data.picklists as Picklists));

	// Loaders return loosely-typed rows; pin the shapes the template needs.
	let projects = $derived(data.projects as { id: string; project_name: string }[]);
	let allSites = $state((data.sites as { id: string; site_name: string; project_id: string }[]) ?? []);

	// Answer state. Scalar answers live in `answers`; people/photos are arrays.
	let answers = $state<Record<string, string>>({});
	let people = $state<{ personnel_id: string; role?: string | null }[]>([]);
	let photos = $state<File[]>([]);

	const m = new WizardMachine(() => queue);
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
	let missingRequired = $state<WizardQuestion[]>([]);
	let showSiteWizard = $state(false);

	function valueFor(q: WizardQuestion): unknown {
		if (q.widget === 'people') return people;
		if (q.widget === 'photos') return photos;
		return answers[q.key] ?? '';
	}

	let currentValid = $derived(current ? isValid(current, valueFor(current)) : false);
	const answeredCount = $derived(queue.filter((q) => isAnswered(q, valueFor(q))).length);

	/** Second-pass skip → blank any partial value so review shows it empty. */
	function clearAnswer(q: WizardQuestion) {
		if (q.widget === 'people' || q.widget === 'photos') return;
		const next = { ...answers };
		delete next[q.key];
		answers = next;
	}

	/** Complete: jump to the first unfilled MIxS-required question, else review. */
	function tryComplete() {
		const missing = queue.filter((q) => q.required && !isAnswered(q, valueFor(q)));
		if (missing.length > 0) {
			missingRequired = missing;
			m.reset(queue.indexOf(missing[0]));
			return;
		}
		missingRequired = [];
		m.toReview();
	}

	function jumpTo(q: WizardQuestion) {
		m.jumpToIndex(queue.indexOf(q));
	}

	function resetForNext(carry: boolean) {
		const kept: Record<string, string> = {};
		if (carry) {
			for (const q of queue) {
				if (q.carryForward && answers[q.key]) kept[q.key] = answers[q.key];
			}
		}
		answers = kept;
		if (!carry) people = [];
		photos = [];
		m.reset(carry ? queue.findIndex((q) => q.key === 'samp_name') : 0);
		missingRequired = [];
	}

	function onSiteCreated(site: { id: string; site_name: string; project_id: string }) {
		allSites = [...allSites, site];
		answers.site_id = site.id;
		showSiteWizard = false;
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
		const body: Record<string, unknown> = {
			project_id: answers.project_id,
			site_id: answers.site_id,
			samp_name: answers.samp_name?.trim(),
			collection_date: answers.collection_date,
			env_medium: answers.env_medium,
			mixs_checklist: checklist,
			extension: extension || null,
			people
		};
		for (const q of queue) {
			if (['project_id', 'site_id', 'samp_name', 'collection_date', 'env_medium'].includes(q.key)) continue;
			if (q.widget === 'people' || q.widget === 'photos') continue;
			const v = answers[q.key];
			if (v && v.toString().trim()) body[q.key] = v;
		}

		const res = await fetch('/api/samples', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			errorMsg = err.error ?? `HTTP ${res.status}`;
			saving = false;
			return;
		}
		const created = (await res.json().catch(() => null)) as { id?: string } | null;
		if (created?.id && photos.length > 0) {
			for (const file of photos) {
				const fd = new FormData();
				fd.append('file', file);
				const up = await fetch(`/api/samples/${created.id}/photos`, { method: 'POST', body: fd });
				if (!up.ok) {
					const err = await up.json().catch(() => ({}));
					errorMsg = `Sample saved, but photo ${file.name} failed: ${err.error ?? up.status}`;
				}
			}
		}
		saving = false;
		successMsg = `Saved “${body.samp_name}”.`;
		resetForNext(addAnother);
	}

	function sitesForProject(projectId: string): { id: string; site_name: string }[] {
		if (!projectId) return [];
		return allSites.filter((s) => s.project_id === projectId);
	}

	const inputCls =
		'w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white text-lg focus:outline-none focus:border-ocean-500';
</script>

{#if showSiteWizard}
	<SiteWizard
		projectId={answers.project_id}
		projectName={projects.find((p) => p.id === answers.project_id)?.project_name ?? ''}
		picklists={data.picklists as Picklists}
		oncreated={onSiteCreated}
		oncancel={() => (showSiteWizard = false)}
	/>
{/if}

<div class="max-w-xl mx-auto space-y-5 pb-28">
	<div class="flex items-center justify-between">
		<a href="/samples" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Samples</a>
		<details class="text-xs text-slate-400">
			<summary class="cursor-pointer">{checklist}{extension ? ` · ${extension}` : ''}</summary>
			<div class="mt-2 grid grid-cols-2 gap-2 p-2 rounded-lg border border-slate-800 bg-slate-900/60">
				<select bind:value={checklist} class="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-xs">
					{#each CHECKLIST_OPTIONS as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
				<select bind:value={extension} class="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-xs">
					<option value="">None</option>
					{#each EXTENSION_OPTIONS as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
			</div>
		</details>
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
				{#each queue as q}
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
			</ul>
		</div>
	{:else if current}
		<!-- Single-question card -->
		<div class="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-5 min-h-[40vh]">
			<div class="flex items-center gap-2">
				<h2 class="text-xl font-bold text-white">{current.label}</h2>
				{#if current.required}<span class="text-rose-400" title="Required">*</span>{:else if current.recommended}<span class="text-amber-400" title="Recommended">*</span>{/if}
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
					<select bind:value={answers.site_id} class={inputCls}>
						<option value="">Select site…</option>
						{#each sitesForProject(answers.project_id) as s}<option value={s.id}>{s.site_name}</option>{/each}
					</select>
					<button type="button" onclick={() => (showSiteWizard = true)}
						class="mt-2 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-ocean-700 text-ocean-300 hover:bg-slate-800 text-sm">
						+ New site (capture GPS)
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
						onchange={(e) => { const inp = e.currentTarget; photos = [...photos, ...Array.from(inp.files ?? [])]; inp.value = ''; }} />
				</label>
				{#if photos.length > 0}
					<ul class="space-y-1">
						{#each photos as file, i}
							<li class="flex items-center gap-2 text-sm text-slate-400">
								<span class="truncate flex-1">{file.name}</span>
								<button type="button" onclick={() => (photos = photos.filter((_, idx) => idx !== i))} class="text-slate-600 hover:text-red-400">✕</button>
							</li>
						{/each}
					</ul>
				{/if}
			{:else if current.widget === 'date'}
				<input type="date" bind:value={answers[current.key]} class={inputCls} />
			{:else if current.widget === 'select'}
				<select bind:value={answers[current.key]} class={inputCls}>
					<option value="">Select…</option>
					{#each current.options ?? [] as o}<option value={o.value}>{o.label}</option>{/each}
				</select>
			{:else if current.widget === 'number'}
				<input type="number" step="any" inputmode="decimal" bind:value={answers[current.key]} placeholder={current.placeholder} class={inputCls} />
			{:else if current.widget === 'textarea'}
				<textarea bind:value={answers[current.key]} placeholder={current.placeholder} rows="3" class={inputCls}></textarea>
			{:else}
				<input type="text" bind:value={answers[current.key]} placeholder={current.placeholder} class={inputCls} />
			{/if}
		</div>
	{/if}

	{#if missingRequired.length > 0 && phase !== 'review'}
		<p class="text-sm text-amber-400">{missingRequired.length} required field(s) still need an answer.</p>
	{/if}
</div>

<!-- Sticky action bar -->
<div class="fixed bottom-0 inset-x-0 border-t border-slate-800 bg-slate-950/95 backdrop-blur p-3">
	<div class="max-w-xl mx-auto flex items-center gap-3">
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
			<button type="button" onclick={() => m.advance(currentValid, clearAnswer)}
				class="flex-1 px-4 py-3 rounded-lg font-medium {currentValid ? 'bg-ocean-600 text-white hover:bg-ocean-500' : 'border border-slate-700 text-slate-300 hover:bg-slate-800'}">
				{currentValid ? 'Next' : 'Skip'}
			</button>
			<button type="button" onclick={tryComplete}
				class="px-4 py-3 border border-green-700 text-green-300 rounded-lg hover:bg-slate-800 font-medium">Complete</button>
		{/if}
	</div>
</div>
