<script lang="ts">
	import PeoplePicker from '$lib/components/PeoplePicker.svelte';
	import FieldLabel from '$lib/components/FieldLabel.svelte';
	import GlossaryDoc from '$lib/components/GlossaryDoc.svelte';
	import { CHECKLIST_OPTIONS, EXTENSION_OPTIONS } from '$lib/mixs/checklists';
	import { allSlotsFor, getSlot, recommendedSlotsFor, requiredSlotsFor } from '$lib/mixs/schema-index';
	import { slotTable } from '$lib/mixs/slot-ownership';
	import { organizeForm, sanitizeMiscParamName, MISC_PARAM_PREFIX, type Picklists } from '$lib/mixs/sample-form';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** MIxS checklist + extension applied to every sample created here. */
	let batchChecklist = $state('MimarksS');
	let batchExtension = $state('Water');

	/** Resolve a key to its MIxS slot title for nicer parameter labels. */
	function slotLabel(key: string, fallback: string): string {
		return getSlot(key)?.title ?? fallback;
	}

	type Row = Record<string, string>;

	type Section = 'Required' | 'Sampling & Storage' | 'Other';

	type ColumnDef = {
		key: string;
		label: string;
		placeholder?: string;
		width?: string;
		required?: boolean;
		recommended?: boolean;
		section: Section;
		/** 'select-project' | 'select-site' for dropdown columns. */
		widget?: string;
	};

	/** Always-present entries at the top of Required. Project/Site are
	 *  SampleTown-local concepts; samp_name/collection_date/env_medium are
	 *  the MIxS core the single-sample form also pinned to the Identity block. */
	const CORE_COLUMNS: ColumnDef[] = [
		{ key: 'project_id', label: 'Project', required: true, section: 'Required', widget: 'select-project', width: 'w-48' },
		{ key: 'site_id', label: 'Site', required: true, section: 'Required', widget: 'select-site', width: 'w-48' },
		{ key: 'samp_name', label: 'Sample name', required: true, section: 'Required' },
		{ key: 'collection_date', label: 'Collection date', placeholder: 'YYYY-MM-DD', width: 'w-40', required: true, section: 'Required' }
	];

	/** SampleTown-specific label/width/placeholder shortcuts for common MIxS
	 *  slots; everything else picks up its title from the schema. */
	const COLUMN_HINTS: Record<string, Partial<ColumnDef>> = {
		env_medium: { label: 'Env medium', width: 'w-48' },
		depth: { label: 'Depth (m)', width: 'w-28' },
		elev: { label: 'Elevation (m)', width: 'w-28' },
		temp: { label: 'Temp (°C)', width: 'w-28' },
		salinity: { label: 'Salinity', width: 'w-28' },
		ph: { label: 'pH', width: 'w-20' },
		filter_type: { label: 'Filter type', width: 'w-36' },
		samp_store_sol: { label: 'Preservation', width: 'w-36' }
	};

	const CORE_KEYS = new Set(CORE_COLUMNS.map((c) => c.key));

	/** Full organizeForm bundle for the active (checklist, extension). Used
	 *  both for auto-seeding the table and for routing each slot into a
	 *  display section. Recomputed reactively when either changes. */
	let organized = $derived(
		organizeForm(batchChecklist, batchExtension, data.picklists as Picklists)
	);

	/** slot → SlotConfig (type, options, placeholder) so table cells can
	 *  render the right widget — a <select> when organizeForm auto-bound a
	 *  picklist (env_medium, geo_loc_name, etc.), a numeric input when the
	 *  MIxS range is numeric, etc. */
	let slotConfigs = $derived.by(() => {
		const map = new Map<string, import('$lib/mixs/sample-form').SlotConfig>();
		for (const c of organized.required) map.set(c.slot, c);
		for (const list of Object.values(organized.optional)) {
			for (const c of list) map.set(c.slot, c);
		}
		return map;
	});

	/** Route a MIxS slot into one of the three Section buckets, mirroring the
	 *  single-sample organizeForm() grouping. Required slots go first;
	 *  everything else picks its bucket (Sampling & Storage / Other) from
	 *  organizeForm. `misc_param:*` custom tags render under Other. */
	function sectionForSlot(slot: string): Section {
		if (slot.startsWith(MISC_PARAM_PREFIX)) return 'Other';
		if (requiredSlotsFor(batchChecklist, batchExtension).includes(slot)) return 'Required';
		for (const [bucket, items] of Object.entries(organized.optional)) {
			if (items.some((i) => i.slot === slot)) {
				return bucket === 'Sampling & Storage' ? 'Sampling & Storage' : 'Other';
			}
		}
		return 'Other';
	}

	/** Build a ColumnDef for a MIxS slot — pulls label/width from COLUMN_HINTS,
	 *  required/recommended from the active combination class, section from
	 *  the organizeForm buckets. */
	function columnDefForSlot(key: string): ColumnDef {
		const hint = COLUMN_HINTS[key] ?? {};
		const isCustom = key.startsWith(MISC_PARAM_PREFIX);
		const required = !isCustom && requiredSlotsFor(batchChecklist, batchExtension).includes(key);
		const recommended = !isCustom && recommendedSlotsFor(batchChecklist, batchExtension).has(key);
		return {
			key,
			label: hint.label ?? (isCustom ? key.slice(MISC_PARAM_PREFIX.length) : slotLabel(key, key)),
			width: hint.width,
			placeholder: hint.placeholder,
			required,
			recommended,
			section: sectionForSlot(key)
		};
	}

	let extraColumnKeys = $state<string[]>([]);
	/** Slots the user explicitly removed — auto-seed skips these so the ✕
	 *  button actually sticks instead of having the seed re-add the row. */
	let suppressedKeys = $state<Set<string>>(new Set());
	/** Slots the user added via the +Add parameter picker (not auto-seeded).
	 *  We preserve these across combination changes as long as the slot is
	 *  still valid for the new combination. Auto-seeded entries from a
	 *  previous combination get pruned on switch so the table doesn't
	 *  accumulate stale fields. */
	let userAddedKeys = $state<Set<string>>(new Set());

	/** Compute the auto-seed set (required on samples + S&S bucket +
	 *  recommended Other) for the current combination. Used by both the
	 *  seed effect and the combination-switch prune. */
	function autoSeedFor(checklist: string, extension: string): Set<string> {
		const req = requiredSlotsFor(checklist, extension)
			.filter((s) => !CORE_KEYS.has(s) && slotTable(s) === 'samples');
		const org = organizeForm(checklist, extension, data.picklists as Picklists);
		const storage = (org.optional['Sampling & Storage'] ?? []).map((f) => f.slot);
		const otherRec = (org.optional.Other ?? []).filter((f) => f.recommended).map((f) => f.slot);
		return new Set([...req, ...storage, ...otherRec]);
	}

	/** Detect combination changes so we can (a) drop slots that were
	 *  auto-seeded by a previous combination and aren't part of the new
	 *  combination's seed, and (b) clear the suppression set so the new
	 *  seed populates. User-added slots (via +Add parameter) that are still
	 *  valid for the new combination are preserved. Declaration order
	 *  matters — this effect runs before the auto-seed below. */
	let prevCombo = $state<string>(`${batchChecklist}|${batchExtension}`);
	$effect(() => {
		const combo = `${batchChecklist}|${batchExtension}`;
		if (combo === prevCombo) return;
		prevCombo = combo;
		const newSeed = autoSeedFor(batchChecklist, batchExtension);
		const validSlots = new Set(allSlotsFor(batchChecklist, batchExtension));
		// Keep a slot if:
		//   - it's a misc_param:* custom tag (off-schema, unrelated to combo)
		//   - it's part of the new combination's auto-seed (will be re-added
		//     by the seed effect anyway — keeping it preserves cell values)
		//   - the user added it explicitly and it's still valid in the new
		//     combination class
		const kept = extraColumnKeys.filter(
			(k) =>
				k.startsWith(MISC_PARAM_PREFIX) ||
				newSeed.has(k) ||
				(userAddedKeys.has(k) && validSlots.has(k))
		);
		const dropped = new Set(extraColumnKeys.filter((k) => !kept.includes(k)));
		if (dropped.size > 0) {
			extraColumnKeys = kept;
			rows = rows.map((r) => {
				const next = { ...r };
				for (const k of dropped) delete next[k];
				return next;
			});
			// Also drop any stale user-added entries (slots no longer valid).
			const nextUser = new Set(userAddedKeys);
			for (const k of dropped) nextUser.delete(k);
			userAddedKeys = nextUser;
		}
		suppressedKeys = new Set();
	});

	/** Auto-seed the parameter list with what the single-sample form would
	 *  show by default (see autoSeedFor). Respects suppressedKeys so ✕
	 *  removal isn't undone and runs after the combination-switch prune. */
	$effect(() => {
		void organized; // subscribe to (checklist, extension) changes
		const desired = [...autoSeedFor(batchChecklist, batchExtension)].filter(
			(s) => !suppressedKeys.has(s)
		);
		const toAdd = desired.filter((s) => !extraColumnKeys.includes(s));
		if (toAdd.length > 0) {
			extraColumnKeys = [...extraColumnKeys, ...toAdd];
			rows = rows.map((r) => ({ ...r, ...Object.fromEntries(toAdd.map((k) => [k, r[k] ?? ''])) }));
		}
	});

	let columns = $derived<ColumnDef[]>([
		...CORE_COLUMNS,
		...extraColumnKeys.map(columnDefForSlot)
	]);

	/** Group columns into the three display sections in the order Required →
	 *  Sampling & Storage → Other, matching the single-sample form. */
	const SECTION_ORDER: Section[] = ['Required', 'Sampling & Storage', 'Other'];
	let sections = $derived.by<{ title: Section; cols: ColumnDef[] }[]>(() => {
		const grouped: Record<Section, ColumnDef[]> = {
			Required: [],
			'Sampling & Storage': [],
			Other: []
		};
		for (const c of columns) grouped[c.section].push(c);
		return SECTION_ORDER.filter((s) => grouped[s].length > 0).map((s) => ({
			title: s,
			cols: grouped[s]
		}));
	});

	/** Slots valid for the selected (checklist, extension), minus anything
	 *  already in the table — drives the searchable +Add parameter picker. */
	let availableExtraSlots = $derived.by<string[]>(() => {
		const inTable = new Set<string>([...CORE_KEYS, ...extraColumnKeys]);
		const all = allSlotsFor(batchChecklist, batchExtension);
		return all
			.filter((s) => !inTable.has(s))
			.filter((s) => slotTable(s) === 'samples')
			.sort();
	});

	function initialRow(): Row {
		const row = Object.fromEntries(columns.map((c) => [c.key, ''])) as Row;
		if (data.preselectedProjectId) row.project_id = data.preselectedProjectId;
		if (data.preselectedSiteId) row.site_id = data.preselectedSiteId;
		return row;
	}
	function emptyRow(): Row {
		return Object.fromEntries(columns.map((c) => [c.key, ''])) as Row;
	}

	let people = $state<{ personnel_id: string; role?: string | null }[]>([]);
	let rows = $state<Row[]>([initialRow()]);
	let saving = $state(false);
	let errorMsg = $state('');
	let result = $state<{ imported: number; failed: number; errors: string[] } | null>(null);
	let extraToAdd = $state('');

	// Site filtering by project per row
	function sitesForProject(projectId: string): any[] {
		if (!projectId) return data.sites as any[];
		return (data.sites as any[]).filter((s: any) => s.project_id === projectId);
	}

	/** Name-for-id helpers so the per-row input can round-trip between the
	 *  human-readable project/site names shown in the datalist and the IDs
	 *  stored on each row (used by the submit loop). */
	const projectsById = $derived(
		new Map((data.projects as any[]).map((p: any) => [p.id, p]))
	);
	const sitesById = $derived(
		new Map((data.sites as any[]).map((s: any) => [s.id, s]))
	);
	function projectNameFromId(id: string): string {
		return (projectsById.get(id) as any)?.project_name ?? '';
	}
	function siteNameFromId(id: string): string {
		return (sitesById.get(id) as any)?.site_name ?? '';
	}
	function projectIdFromName(name: string): string {
		const p = (data.projects as any[]).find((x: any) => x.project_name === name);
		return (p as any)?.id ?? '';
	}
	function siteIdFromName(name: string, projectId: string): string {
		const pool = projectId
			? (data.sites as any[]).filter((s: any) => s.project_id === projectId)
			: (data.sites as any[]);
		const s = pool.find((x: any) => x.site_name === name);
		return (s as any)?.id ?? '';
	}

	function addRow() { rows = [...rows, emptyRow()]; }
	function removeRow(i: number) {
		if (rows.length <= 1) return;
		rows = rows.filter((_, idx) => idx !== i);
	}

	function addColumn() {
		if (!extraToAdd) return;
		// Custom tag path: sanitize `misc_param:<name>` before adding. Everything
		// else must match an available MIxS slot to keep the combobox honest.
		let key = extraToAdd;
		if (key.startsWith(MISC_PARAM_PREFIX)) {
			const name = sanitizeMiscParamName(key.slice(MISC_PARAM_PREFIX.length));
			if (!name) return;
			key = `${MISC_PARAM_PREFIX}${name}`;
		} else if (!availableExtraSlots.includes(key)) {
			return;
		}
		if (extraColumnKeys.includes(key)) { extraToAdd = ''; return; }
		extraColumnKeys = [...extraColumnKeys, key];
		userAddedKeys = new Set([...userAddedKeys, key]);
		// Un-suppress if the user had previously removed it: explicit re-add beats
		// the earlier ✕ click.
		if (suppressedKeys.has(key)) {
			const next = new Set(suppressedKeys);
			next.delete(key);
			suppressedKeys = next;
		}
		rows = rows.map((r) => ({ ...r, [key]: '' }));
		extraToAdd = '';
	}
	function removeColumn(key: string) {
		extraColumnKeys = extraColumnKeys.filter((k) => k !== key);
		// Remember the removal so the auto-seed effect doesn't immediately
		// re-add a required / S&S / recommended slot back to the bottom.
		suppressedKeys = new Set([...suppressedKeys, key]);
		rows = rows.map((r) => {
			const next = { ...r };
			delete next[key];
			return next;
		});
	}

	/** Copy sample #1's value for a parameter to every subsequent sample whose
	 *  cell is empty. Non-destructive — existing values aren't touched, so
	 *  users can tweak individual samples after a fill without losing work. */
	function fillRight(field: string) {
		if (rows.length <= 1) return;
		const value = rows[0][field];
		if (!value || !value.toString().trim()) return;
		rows = rows.map((row, i) => {
			if (i === 0) return row;
			const current = row[field];
			if (current && current.toString().trim()) return row;
			const next = { ...row, [field]: value };
			if (field === 'project_id' && next.site_id) {
				const ok = (data.sites as any[]).some(
					(s: any) => s.id === next.site_id && s.project_id === value
				);
				if (!ok) next.site_id = '';
			}
			return next;
		});
	}

	/** Copy every non-empty value from rows[0] to every other row's empty
	 *  cells. Non-destructive sibling to fillRight. */
	function applyFirstToEmpty() {
		const tpl = rows[0];
		if (!tpl) return;
		rows = rows.map((row, i) => {
			if (i === 0) return row;
			const next = { ...row };
			for (const c of columns) {
				const v = tpl[c.key];
				if ((!next[c.key] || !next[c.key].toString().trim()) && v?.toString().trim()) {
					next[c.key] = v;
				}
			}
			return next;
		});
	}

	function handlePaste(e: ClipboardEvent, rowIdx: number, field: string) {
		const text = e.clipboardData?.getData('text') ?? '';
		if (!text.includes('\t') && !text.includes('\n')) return;
		e.preventDefault();

		const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim());
		const fieldOrder = columns.map((c) => c.key);
		const startFieldIdx = fieldOrder.indexOf(field);

		const newRows = [...rows];
		while (newRows.length < rowIdx + lines.length) newRows.push(emptyRow());

		lines.forEach((line, li) => {
			const cells = line.split('\t');
			cells.forEach((cell, ci) => {
				const colIdx = startFieldIdx + ci;
				if (colIdx >= fieldOrder.length) return;
				newRows[rowIdx + li][fieldOrder[colIdx]] = cell.trim();
			});
		});

		rows = newRows;
	}

	const nonEmptyRows = $derived(
		rows.filter((r) => r.samp_name?.trim())
	);

	async function submit() {
		errorMsg = '';
		result = null;
		if (nonEmptyRows.some((r) => !r.project_id)) {
			errorMsg = 'Every row needs a project';
			return;
		}
		if (nonEmptyRows.length === 0) {
			errorMsg = 'Add at least one row with a sample name';
			return;
		}

		saving = true;
		const errors: string[] = [];
		let imported = 0;

		for (const row of nonEmptyRows) {
			const body: Record<string, unknown> = {
				project_id: row.project_id,
				site_id: row.site_id,
				samp_name: row.samp_name.trim(),
				mixs_checklist: batchChecklist,
				extension: batchExtension || null,
				people
			};
			for (const col of columns) {
				if (['samp_name', 'project_id', 'site_id'].includes(col.key)) continue;
				const v = row[col.key];
				if (v && v.toString().trim()) body[col.key] = v;
			}

			const res = await fetch('/api/samples', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (res.ok) {
				imported++;
			} else {
				const err = await res.json().catch(() => ({}));
				errors.push(`${row.samp_name}: ${err.error ?? `HTTP ${res.status}`}`);
			}
		}

		saving = false;
		result = { imported, failed: errors.length, errors };
		if (errors.length === 0) {
			rows = [emptyRow()];
		}
	}

	const inputCls =
		'w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-white text-sm focus:outline-none focus:border-ocean-500';
	const selectCls =
		'w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-white text-sm focus:outline-none focus:border-ocean-500';
</script>

<div class="max-w-6xl space-y-6">
	<div>
		<a href="/samples" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Samples</a>
		<h1 class="text-2xl font-bold text-white mt-1">New Sample{nonEmptyRows.length > 1 ? 's' : ''}</h1>
	</div>

	<!-- MIxS checklist + extension applied to every sample created here. -->
	<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-lg border border-slate-800 bg-slate-900/40">
		<div>
			<FieldLabel slot="mixs_checklist" for="batch_checklist" label="MIxS Checklist" description="Selects the MIxS LinkML class (MIGS, MIMS, MIMARKS-S, MIMARKS-C, etc.) that defines required/recommended parameters for every sample created here." />
			<select id="batch_checklist" bind:value={batchChecklist} class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500">
				{#each CHECKLIST_OPTIONS as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>
		<div>
			<FieldLabel slot="extension" for="batch_extension" label="MIxS Extension" description="Environmental extension (formerly env_package) — water / soil / host-associated / etc. Narrows required parameters further." />
			<select id="batch_extension" bind:value={batchExtension} class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500">
				<option value="">None</option>
				{#each EXTENSION_OPTIONS as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>
	</div>

	{#if errorMsg}
		<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">
			{errorMsg}
		</div>
	{/if}

	{#if result}
		<div class="p-3 rounded-lg border {result.failed === 0 ? 'bg-green-900/20 border-green-800 text-green-300' : 'bg-yellow-900/20 border-yellow-800 text-yellow-300'} text-sm">
			<p class="font-medium">
				{result.imported} imported{result.failed > 0 ? `, ${result.failed} failed` : ''}
			</p>
			{#if result.errors.length > 0}
				<ul class="mt-2 text-xs font-mono space-y-0.5 max-h-40 overflow-y-auto">
					{#each result.errors as err}<li>{err}</li>{/each}
				</ul>
			{/if}
		</div>
	{/if}

	<!-- Controls: submit / cancel / +Sample / +parameter picker -->
	<div class="flex items-center gap-3 flex-wrap">
		<button
			type="button"
			onclick={addRow}
			class="px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm"
		>
			+ Sample
		</button>
		<button
			type="button"
			onclick={submit}
			disabled={saving || nonEmptyRows.length === 0}
			class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium"
		>
			{saving ? 'Creating...' : `Create ${nonEmptyRows.length} sample${nonEmptyRows.length === 1 ? '' : 's'}`}
		</button>
		<a
			href="/samples"
			class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium"
		>
			Cancel
		</a>

	</div>

	<div class="flex items-center gap-4 flex-wrap">
		<PeoplePicker
			bind:people
			personnel={data.personnel}
			roleOptions={data.picklists.person_role}
			label="People (applied to all samples)"
		/>
		<p class="text-xs text-slate-500 flex-1 min-w-48">
			Each column is a sample. Use the <span class="text-ocean-400">fill&nbsp;→</span> button on a parameter
			to broadcast sample #1's value across the row, or
			<button type="button" onclick={applyFirstToEmpty} class="text-ocean-400 hover:text-ocean-300 underline">
				copy #1 into empty cells
			</button>.
			Paste from a spreadsheet to auto-fill.
		</p>
	</div>

	<!-- Shared datalist for the Project combobox in every row. Per-row site
	     datalists are rendered inline since they filter by the row's project. -->
	<datalist id="batch-projects">
		{#each data.projects as p}<option value={p.project_name}></option>{/each}
	</datalist>

	<!-- Transposed layout: each tbody row is one parameter, each sample is a
	     column. Sections mirror the single-sample form (Required / Sampling &
	     Storage / Other) with red * for MIxS-required and amber * for
	     MIxS-recommended. Leftmost column hosts the per-row ✕ remove button
	     so users can scan removable rows at a glance. -->
	<div class="overflow-x-auto rounded-lg border border-slate-800">
		<table class="w-full min-w-max text-sm border-collapse">
			<thead>
				<tr class="bg-slate-900 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
					<th class="w-8 sticky left-0 bg-slate-900 z-20"></th>
					<th class="px-2 py-2 text-left font-medium w-72 sticky left-8 bg-slate-900 z-10">Parameter</th>
					<th class="w-14 bg-slate-900"></th>
					{#each rows as _row, i}
						<th class="px-2 py-2 text-left font-medium min-w-48">
							<div class="flex items-center gap-1">
								<span class="font-mono text-slate-400">Sample #{i + 1}</span>
								{#if rows.length > 1}
									<button
										type="button"
										onclick={() => removeRow(i)}
										class="text-slate-700 hover:text-red-400 text-xs ml-auto"
										title="Remove sample"
									>✕</button>
								{/if}
							</div>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each sections as sec}
					<tr class="bg-slate-900/60">
						<th
							colspan={rows.length + 3}
							class="sticky left-0 px-3 py-1.5 text-left text-[11px] uppercase tracking-wider font-semibold text-slate-300 border-y border-slate-800"
						>
							{sec.title}
						</th>
					</tr>
					{#each sec.cols as col}
						<tr class="border-b border-slate-800/50">
							<!-- Remove button (leftmost). Empty for core rows that can't be removed. -->
							<td class="w-8 px-1 py-1 text-center sticky left-0 bg-slate-950 z-10 align-top">
								{#if extraColumnKeys.includes(col.key)}
									<button
										type="button"
										onclick={() => removeColumn(col.key)}
										class="text-slate-700 hover:text-red-400 text-xs"
										title="Remove parameter"
									>✕</button>
								{/if}
							</td>
							<!-- Parameter label cell (sticky for horizontal scrolling). -->
							<th class="px-2 py-1 text-left font-medium sticky left-8 bg-slate-950 z-10 align-top">
								<div class="flex items-center gap-1 flex-wrap">
									<span class="text-slate-200 leading-tight">{col.label}</span>
									{#if col.required}<span class="text-rose-400" title="Required by MIxS" aria-label="required">*</span>{:else if col.recommended}<span class="text-amber-400" title="Recommended by MIxS" aria-label="recommended">*</span>{/if}
									{#if getSlot(col.key)}
										<GlossaryDoc slot={col.key} iconOnly />
									{/if}
								</div>
							</th>
							<!-- fill → lives in its own narrow column so it's right-aligned
							     to the sample inputs and never wraps onto a second line. -->
							<td class="px-1 py-1 text-right align-top">
								{#if rows.length > 1}
									<button
										type="button"
										onclick={() => fillRight(col.key)}
										class="text-[11px] text-slate-500 hover:text-ocean-400 whitespace-nowrap"
										title="Fill sample #1 across empty cells of this parameter"
									>fill&nbsp;→</button>
								{/if}
							</td>
							{#each rows as _row, i}
								<td class="px-2 py-1 align-top">
									{#if col.widget === 'select-project'}
										<input
											type="text"
											list="batch-projects"
											value={projectNameFromId(rows[i][col.key])}
											onchange={(e) => {
												const name = e.currentTarget.value;
												rows[i][col.key] = name ? projectIdFromName(name) : '';
												if (rows[i].site_id && !sitesForProject(rows[i][col.key]).some((s: any) => s.id === rows[i].site_id)) {
													rows[i].site_id = '';
												}
											}}
											placeholder="Project…"
											class="{inputCls} {!rows[i][col.key] && col.required ? 'border-red-800' : ''}"
										/>
									{:else if col.widget === 'select-site'}
										<input
											type="text"
											list="batch-sites-{i}"
											value={siteNameFromId(rows[i][col.key])}
											onchange={(e) => {
												const name = e.currentTarget.value;
												rows[i][col.key] = name ? siteIdFromName(name, rows[i].project_id) : '';
											}}
											placeholder={rows[i].project_id ? 'Site…' : 'Pick project first'}
											class="{inputCls} {!rows[i][col.key] && col.required ? 'border-red-800' : ''}"
										/>
										<datalist id="batch-sites-{i}">
											{#each sitesForProject(rows[i].project_id) as s}<option value={s.site_name}></option>{/each}
										</datalist>
									{:else if col.key === 'collection_date'}
										<input
											type="date"
											bind:value={rows[i][col.key]}
											onpaste={(e) => handlePaste(e, i, col.key)}
											class="{inputCls} {col.required && !rows[i][col.key] ? 'border-red-800' : ''}"
										/>
									{:else if slotConfigs.get(col.key)?.type === 'select'}
										{@const cfg = slotConfigs.get(col.key)}
										<select
											bind:value={rows[i][col.key]}
											class="{inputCls} {col.required && !rows[i][col.key] ? 'border-red-800' : ''}"
										>
											<option value="">Select…</option>
											{#each cfg?.options ?? [] as opt}
												<option value={opt.value}>{opt.label}</option>
											{/each}
										</select>
									{:else if slotConfigs.get(col.key)?.type === 'number'}
										<input
											type="number"
											step="any"
											bind:value={rows[i][col.key]}
											onpaste={(e) => handlePaste(e, i, col.key)}
											placeholder={col.placeholder ?? slotConfigs.get(col.key)?.placeholder}
											class="{inputCls} {col.required && !rows[i][col.key] ? 'border-red-800' : ''}"
										/>
									{:else if slotConfigs.get(col.key)?.type === 'textarea'}
										<textarea
											bind:value={rows[i][col.key]}
											onpaste={(e) => handlePaste(e, i, col.key)}
											placeholder={col.placeholder ?? slotConfigs.get(col.key)?.placeholder}
											rows="1"
											class="{inputCls} {col.required && !rows[i][col.key] ? 'border-red-800' : ''}"
										></textarea>
									{:else}
										<input
											type="text"
											bind:value={rows[i][col.key]}
											onpaste={(e) => handlePaste(e, i, col.key)}
											placeholder={col.placeholder ?? slotConfigs.get(col.key)?.placeholder}
											class="{inputCls} {col.required && !rows[i][col.key] ? 'border-red-800' : ''}"
										/>
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				{/each}

				<!-- +Add parameter: last row. Input lives in the parameter-label
				     column so it reads as the bottom of the list rather than a
				     header-bar control. -->
				<tr>
					<td class="w-8 px-1 sticky left-0 bg-slate-950 z-10"></td>
					<td class="px-2 py-2 sticky left-8 bg-slate-950 z-10" colspan={rows.length + 2}>
						<div class="flex items-center gap-2">
							<input
								type="text"
								list="batch-add-column-slots"
								bind:value={extraToAdd}
								placeholder="+ Add parameter (or misc_param:…) — search {availableExtraSlots.length} options…"
								class="flex-1 min-w-60 max-w-xl px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500"
								onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addColumn(); } }}
							/>
							<datalist id="batch-add-column-slots">
								{#each availableExtraSlots as slot}
									{@const title = getSlot(slot)?.title}
									<option value={slot} label={title ? `${slot} — ${title}` : slot}></option>
								{/each}
							</datalist>
							<button
								type="button"
								onclick={addColumn}
								disabled={!extraToAdd || (!availableExtraSlots.includes(extraToAdd) && !extraToAdd.startsWith(MISC_PARAM_PREFIX))}
								class="px-2 py-1.5 border border-slate-700 text-slate-300 rounded hover:bg-slate-800 disabled:opacity-40 transition-colors text-sm"
							>Add</button>
						</div>
					</td>
				</tr>
			</tbody>
		</table>
	</div>
</div>
