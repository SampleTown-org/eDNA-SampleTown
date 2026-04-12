<script lang="ts">
	import { goto } from '$app/navigation';
	import PeoplePicker from '$lib/components/PeoplePicker.svelte';
	import { cart } from '$lib/stores/cart.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Row = Record<string, string>;

	type ColumnDef = {
		key: string;
		label: string;
		placeholder?: string;
		width?: string;
		required?: boolean;
		/** 'select-project' | 'select-site' for dropdown columns */
		widget?: string;
	};

	const CORE_COLUMNS: ColumnDef[] = [
		{ key: 'project_id', label: 'Project *', width: 'w-40', required: true, widget: 'select-project' },
		{ key: 'site_id', label: 'Site *', width: 'w-40', required: true, widget: 'select-site' },
		{ key: 'samp_name', label: 'Sample name *', required: true },
		{ key: 'collection_date', label: 'Collection date', placeholder: 'YYYY-MM-DD', width: 'w-36' },
		{ key: 'notes', label: 'Notes' }
	];

	const ADDITIONAL_COLUMNS: ColumnDef[] = [
		{ key: 'env_medium', label: 'Env medium', width: 'w-40' },
		{ key: 'depth', label: 'Depth (m)', width: 'w-24' },
		{ key: 'elev', label: 'Elevation (m)', width: 'w-24' },
		{ key: 'temp', label: 'Temp (°C)', width: 'w-24' },
		{ key: 'salinity', label: 'Salinity', width: 'w-24' },
		{ key: 'ph', label: 'pH', width: 'w-20' },
		{ key: 'samp_vol_we_dna_ext', label: 'Vol filtered (mL)', width: 'w-28' },
		{ key: 'filter_type', label: 'Filter type', width: 'w-32' },
		{ key: 'samp_store_sol', label: 'Preservation', width: 'w-32' }
	];

	let extraColumnKeys = $state<string[]>([]);
	let columns = $derived<ColumnDef[]>([
		...CORE_COLUMNS,
		...extraColumnKeys
			.map((k) => ADDITIONAL_COLUMNS.find((c) => c.key === k))
			.filter((c): c is ColumnDef => Boolean(c))
	]);
	let availableExtras = $derived(
		ADDITIONAL_COLUMNS.filter((c) => !extraColumnKeys.includes(c.key))
	);

	function emptyRow(): Row {
		return Object.fromEntries(columns.map((c) => [c.key, '']));
	}

	let people = $state<{ personnel_id: string; role?: string | null }[]>([]);
	let rows = $state<Row[]>([emptyRow(), emptyRow(), emptyRow(), emptyRow(), emptyRow()]);
	let saving = $state(false);
	let errorMsg = $state('');
	let result = $state<{ imported: number; failed: number; errors: string[] } | null>(null);
	let extraToAdd = $state('');

	// Site filtering by project per row
	function sitesForProject(projectId: string): any[] {
		if (!projectId) return data.sites as any[];
		return (data.sites as any[]).filter((s: any) => s.project_id === projectId);
	}

	function addRow() { rows = [...rows, emptyRow()]; }
	function removeRow(i: number) {
		if (i === 0) return;
		rows = rows.filter((_, idx) => idx !== i);
	}

	function addColumn() {
		if (!extraToAdd) return;
		extraColumnKeys = [...extraColumnKeys, extraToAdd];
		rows = rows.map((r) => ({ ...r, [extraToAdd]: '' }));
		extraToAdd = '';
	}
	function removeColumn(key: string) {
		extraColumnKeys = extraColumnKeys.filter((k) => k !== key);
		rows = rows.map((r) => {
			const next = { ...r };
			delete next[key];
			return next;
		});
	}

	function applyTemplate() {
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
		rows.slice(1).filter((r) => r.samp_name?.trim())
	);

	function onTemplateKeydown(e: KeyboardEvent, field: string) {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		const value = rows[0][field];
		rows = rows.map((row, i) => (i === 0 ? row : { ...row, [field]: value }));
	}

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
			rows = [{ ...rows[0] }, emptyRow(), emptyRow(), emptyRow(), emptyRow()];
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
		<h1 class="text-2xl font-bold text-white mt-1">New Sample</h1>
	</div>

	<div class="flex gap-1 p-1 bg-slate-800 rounded-lg w-fit">
		<a href="/samples/new" class="px-4 py-1.5 rounded text-sm font-medium text-slate-400 hover:text-white transition-colors">Single</a>
		<span class="px-4 py-1.5 rounded text-sm font-medium bg-ocean-600 text-white">Batch</span>
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

	<!-- Controls: buttons on top, then add-column + tips -->
	<div class="flex items-center gap-3 flex-wrap">
		<button
			type="button"
			onclick={addRow}
			class="px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm"
		>
			+ Row
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

		<div class="ml-auto flex items-center gap-2">
			{#if availableExtras.length > 0}
				<select
					bind:value={extraToAdd}
					class="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-ocean-500"
				>
					<option value="">+ Add column…</option>
					{#each availableExtras as col}<option value={col.key}>{col.label}</option>{/each}
				</select>
				<button
					type="button"
					onclick={addColumn}
					disabled={!extraToAdd}
					class="px-2 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 disabled:opacity-40 transition-colors text-sm"
				>Add</button>
			{/if}
		</div>
	</div>

	<div class="flex items-center gap-4 flex-wrap">
		<PeoplePicker
			bind:people
			personnel={data.personnel}
			roleOptions={data.picklists.person_role}
			label="People (applied to all rows)"
		/>
		<p class="text-xs text-slate-500 flex-1 min-w-48">
			Row <span class="text-ocean-400">⭐</span> is a template —
			<kbd class="text-ocean-400">Enter</kbd> fills column down, or
			<button type="button" onclick={applyTemplate} class="text-ocean-400 hover:text-ocean-300 underline">
				apply all to empty cells
			</button>.
			Paste from a spreadsheet to auto-fill.
		</p>
	</div>

	<div class="overflow-x-auto rounded-lg border border-slate-800">
		<table class="w-full text-sm">
			<thead>
				<tr class="bg-slate-900 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
					<th class="w-8 px-1"></th>
					<th class="px-2 py-2 text-left font-medium w-10">#</th>
					{#each columns as col}
						<th class="px-2 py-2 text-left font-medium {col.width ?? ''}">
							<div class="flex items-center gap-1">
								<span class={col.required ? 'text-red-400' : ''}>{col.label}</span>
								{#if extraColumnKeys.includes(col.key)}
									<button
										type="button"
										onclick={() => removeColumn(col.key)}
										class="text-slate-600 hover:text-red-400 text-xs ml-auto"
										title="Remove column"
									>×</button>
								{/if}
							</div>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each rows as row, i}
					{@const isTpl = i === 0}
					<tr class="border-b border-slate-800/50 {isTpl ? 'bg-ocean-900/20' : ''}">
						<td class="px-1 py-1">
							{#if !isTpl}
								<button
									type="button"
									onclick={() => removeRow(i)}
									class="text-slate-700 hover:text-red-400 text-xs"
									title="Remove row"
								>✕</button>
							{/if}
						</td>
						<td class="px-2 py-1 text-slate-500 text-xs font-mono">
							{#if isTpl}
								<span class="text-ocean-400" title="Template — Enter in any cell fills the column">⭐</span>
							{:else}
								{i}
							{/if}
						</td>
						{#each columns as col}
							<td class="px-2 py-1">
								{#if col.widget === 'select-project'}
									<select
										bind:value={rows[i][col.key]}
										class="{selectCls} {!isTpl && !rows[i][col.key] ? 'border-red-800' : ''}"
									>
										<option value="">Select...</option>
										{#each data.projects as p}<option value={p.id}>{p.project_name}</option>{/each}
									</select>
								{:else if col.widget === 'select-site'}
									<select
										bind:value={rows[i][col.key]}
										class={selectCls}
									>
										<option value="">Select...</option>
										{#each sitesForProject(rows[i].project_id) as s}<option value={s.id}>{s.site_name}</option>{/each}
									</select>
								{:else}
									<input
										type="text"
										bind:value={rows[i][col.key]}
										onpaste={(e) => handlePaste(e, i, col.key)}
										onkeydown={isTpl ? (e) => onTemplateKeydown(e, col.key) : undefined}
										placeholder={col.placeholder}
										class="{inputCls} {col.required && !isTpl && !rows[i][col.key] ? 'border-red-800' : ''}"
									/>
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
