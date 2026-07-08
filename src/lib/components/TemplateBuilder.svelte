<!--
  Template builder — create/edit a sample-capture template (docs/dev/offline-pwa.md).
  A template = name + MIxS combo + an ordered list of parameters, each with an
  optional pre-fill value. Reused by the quick's "+ New template" quick-add and
  the Settings management tab. Saves via /api/settings/templates.
-->
<script lang="ts">
	import { CHECKLIST_OPTIONS, EXTENSION_OPTIONS } from '$lib/mixs/checklists';
	import GlossaryDoc from '$lib/components/GlossaryDoc.svelte';
	import { availableSlots, defaultTemplateParams, questionForKey, suggestedExtraKeys, type TemplateParam } from '$lib/quick/queue';
	import { sanitizeMiscParamName, MISC_PARAM_PREFIX, type Picklists } from '$lib/mixs/sample-form';
	import { getSlot } from '$lib/mixs/schema-index';

	interface ExistingTemplate {
		id: string;
		name: string;
		description?: string | null;
		mixs_checklist: string;
		extension: string | null;
		params: string; // JSON
	}

	interface Props {
		picklists: Picklists;
		/** When editing, the template to load; null/undefined = create new. */
		template?: ExistingTemplate | null;
		/** Seed combo when creating new (defaults MimarksS/Water). */
		initialChecklist?: string;
		initialExtension?: string;
		oncreated: (t: ExistingTemplate) => void;
		oncancel: () => void;
	}
	let { picklists, template = null, initialChecklist = 'MimarksS', initialExtension = 'Water', oncreated, oncancel }: Props = $props();

	let name = $state(template?.name ?? '');
	let description = $state(template?.description ?? '');
	let checklist = $state(template?.mixs_checklist ?? initialChecklist);
	let extension = $state(template?.extension ?? initialExtension);
	let params = $state<TemplateParam[]>(
		template ? (JSON.parse(template.params) as TemplateParam[]) : []
	);
	let addKey = $state('');
	let miscName = $state('');
	let saving = $state(false);
	let errorMsg = $state('');
	let seedMsg = $state('');

	const present = $derived(new Set(params.map((p) => p.key)));
	const slotChoices = $derived(availableSlots(checklist, extension || null, present));
	const suggestions = $derived(suggestedExtraKeys(checklist, extension || null, present));

	function labelFor(key: string): string {
		if (key.startsWith(MISC_PARAM_PREFIX)) return key.slice(MISC_PARAM_PREFIX.length).replace(/_/g, ' ');
		return getSlot(key)?.title ?? key;
	}

	function add(key: string) {
		if (!key || present.has(key)) return;
		params = [...params, { key }];
		addKey = '';
	}
	function addMisc() {
		const n = sanitizeMiscParamName(miscName);
		if (!n) return;
		add(`${MISC_PARAM_PREFIX}${n}`);
		miscName = '';
	}
	function remove(key: string) {
		params = params.filter((p) => p.key !== key);
	}

	// Reorder parameters — the stored order is what the quick runs, so dragging
	// overrides the default required→suggested→optional ordering. Drag handle for
	// desktop; ↑/↓ buttons for touch/precision.
	let dragIndex = $state<number | null>(null);
	function moveParam(from: number, to: number) {
		if (to < 0 || to >= params.length || from === to) return;
		const next = [...params];
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved);
		params = next;
	}
	function onDrop(target: number) {
		if (dragIndex !== null) moveParam(dragIndex, target);
		dragIndex = null;
	}
	function seedRequired() {
		const req = defaultTemplateParams(checklist, extension || null, picklists);
		const before = params.length;
		const merged = [...params];
		for (const r of req) if (!merged.some((p) => p.key === r.key)) merged.push(r);
		params = merged;
		const added = params.length - before;
		seedMsg =
			added > 0
				? `Added ${added} required parameter(s).`
				: 'No sample-level required fields for this combination beyond the identity fields (project, site, name, date, medium) the quick always asks.';
	}

	async function save() {
		errorMsg = '';
		if (!name.trim()) {
			errorMsg = 'Name is required';
			return;
		}
		saving = true;
		const body = {
			name: name.trim(),
			description: description.trim() || null,
			mixs_checklist: checklist,
			extension: extension || null,
			params: params.map((p) => (p.value?.trim() ? { key: p.key, value: p.value.trim() } : { key: p.key }))
		};
		const url = template ? `/api/settings/templates/${template.id}` : '/api/settings/templates';
		const res = await fetch(url, {
			method: template ? 'PUT' : 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		saving = false;
		if (!res.ok) {
			const err = await res.json().catch(() => ({}));
			errorMsg = err.error ?? `HTTP ${res.status}`;
			return;
		}
		oncreated((await res.json()) as ExistingTemplate);
	}

	const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500';
</script>

<div class="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur flex flex-col">
	<div class="flex-1 overflow-y-auto">
		<div class="max-w-xl mx-auto p-4 space-y-4">
		<div class="flex items-center justify-between">
			<h1 class="text-lg font-bold text-white">{template ? 'Edit' : 'New'} template</h1>
			<button type="button" onclick={oncancel} class="text-sm text-slate-400 hover:text-red-400">Cancel</button>
		</div>

		{#if errorMsg}
			<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>
		{/if}

		<div class="space-y-3">
			<div>
				<label for="tpl-name" class="block text-xs text-slate-400 mb-1">Name</label>
				<input id="tpl-name" type="text" bind:value={name} placeholder="e.g. Beaufort water — eDNA" class={inputCls} />
			</div>
			<div>
				<label for="tpl-desc" class="block text-xs text-slate-400 mb-1">Description (optional)</label>
				<input id="tpl-desc" type="text" bind:value={description} class={inputCls} />
			</div>
			<div class="grid grid-cols-2 gap-2">
				<select bind:value={checklist} class={inputCls}>
					{#each CHECKLIST_OPTIONS as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
				<select bind:value={extension} class={inputCls}>
					<option value="">None</option>
					{#each EXTENSION_OPTIONS as opt}<option value={opt.value}>{opt.label}</option>{/each}
				</select>
			</div>
		</div>

		<div class="space-y-2">
			<div class="flex items-center justify-between">
				<h2 class="text-sm font-semibold text-slate-300">Parameters</h2>
				<button type="button" onclick={seedRequired} class="text-xs text-ocean-400 hover:text-ocean-300">+ Seed required</button>
			</div>
			{#if seedMsg}<p class="text-xs text-ocean-300">{seedMsg}</p>{/if}
			{#if params.length === 0}
				<p class="text-xs text-slate-500">No parameters yet. Seed the required set or add your own below. (The quick always asks project, site, name, date & medium regardless.)</p>
			{/if}
			<ul class="space-y-2">
				{#each params as p, i (p.key)}
					{@const q = questionForKey(p.key, picklists, { required: false, recommended: false })}
					<li
						class="rounded-lg border border-slate-800 p-2 space-y-1 {dragIndex === i ? 'opacity-50' : ''}"
						draggable="true"
						ondragstart={() => (dragIndex = i)}
						ondragover={(e) => e.preventDefault()}
						ondrop={(e) => { e.preventDefault(); onDrop(i); }}
						ondragend={() => (dragIndex = null)}
					>
						<div class="flex items-center gap-2">
							<span class="cursor-grab text-slate-600 select-none" title="Drag to reorder" aria-hidden="true">⠿</span>
							<span class="text-sm text-slate-200 flex-1">{labelFor(p.key)}</span>
							{#if !p.key.startsWith(MISC_PARAM_PREFIX) && getSlot(p.key)}<GlossaryDoc slot={p.key} iconOnly />{/if}
							<button type="button" onclick={() => moveParam(i, i - 1)} disabled={i === 0} class="text-slate-500 hover:text-white disabled:opacity-30 text-xs" title="Move up" aria-label="Move up">↑</button>
							<button type="button" onclick={() => moveParam(i, i + 1)} disabled={i === params.length - 1} class="text-slate-500 hover:text-white disabled:opacity-30 text-xs" title="Move down" aria-label="Move down">↓</button>
							<button type="button" onclick={() => remove(p.key)} class="text-slate-600 hover:text-red-400 text-xs" title="Remove" aria-label="Remove">✕</button>
						</div>
						{#if q.widget === 'select'}
							<select bind:value={p.value} class="{inputCls} text-sm">
								<option value="">No pre-fill</option>
								{#each q.options ?? [] as o}<option value={o.value}>{o.label}</option>{/each}
							</select>
						{:else if q.widget === 'number'}
							<input type="number" step="any" bind:value={p.value} placeholder="optional pre-fill" class="{inputCls} text-sm" />
						{:else}
							<input type="text" bind:value={p.value} placeholder="optional pre-fill" class="{inputCls} text-sm" />
						{/if}
					</li>
				{/each}
			</ul>

			{#if suggestions.length > 0}
				<div class="flex flex-wrap gap-1.5">
					{#each suggestions as s}
						<button type="button" onclick={() => add(s)} class="px-2 py-1 rounded-full border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs">+ {labelFor(s)}</button>
					{/each}
				</div>
			{/if}

			<div class="flex items-center gap-2">
				<input type="text" list="tpl-slots" bind:value={addKey} placeholder="Add parameter…" class="{inputCls} text-sm flex-1"
					onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(addKey); } }} />
				<datalist id="tpl-slots">
					{#each slotChoices as s}<option value={s}>{getSlot(s)?.title ?? s}</option>{/each}
				</datalist>
				<button type="button" onclick={() => add(addKey)} disabled={!slotChoices.includes(addKey)} class="px-3 py-2 border border-slate-700 text-slate-300 rounded-lg disabled:opacity-40 text-sm">Add</button>
			</div>
			<div class="flex items-center gap-2">
				<input type="text" bind:value={miscName} placeholder="custom param name (misc_param)" class="{inputCls} text-sm flex-1" />
				<button type="button" onclick={addMisc} disabled={!miscName.trim()} class="px-3 py-2 border border-slate-700 text-slate-300 rounded-lg disabled:opacity-40 text-sm">Add custom</button>
			</div>
		</div>
	</div>
	</div>

	<div class="shrink-0 border-t border-slate-800 bg-slate-950/95 backdrop-blur p-3">
		<div class="max-w-xl mx-auto flex items-center gap-3">
			<button type="button" onclick={oncancel} class="px-4 py-3 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800">Cancel</button>
			<button type="button" onclick={save} disabled={saving || !name.trim()} class="flex-1 px-4 py-3 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 font-medium">
				{saving ? 'Saving…' : template ? 'Save changes' : 'Create template'}
			</button>
		</div>
	</div>
</div>
