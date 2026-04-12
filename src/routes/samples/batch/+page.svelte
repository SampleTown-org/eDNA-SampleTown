<script lang="ts">
	import { goto } from '$app/navigation';
	import PeoplePicker from '$lib/components/PeoplePicker.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Row = Record<string, string>;

	/**
	 * Column definition. `key` is the body field name posted to /api/samples;
	 * `numericPair` flags lat/lon for the lat_lon assembly logic in submit().
	 */
	type ColumnDef = {
		key: string;
		label: string;
		placeholder?: string;
		width?: string;
	};

	const CORE_COLUMNS: ColumnDef[] = [
		{ key: 'samp_name', label: 'Sample name *' },
		{ key: 'collection_date', label: 'Collection date', placeholder: 'YYYY-MM-DD', width: 'w-36' },
		{ key: 'latitude', label: 'Latitude', width: 'w-28' },
		{ key: 'longitude', label: 'Longitude', width: 'w-28' },
		{ key: 'notes', label: 'Notes' }
	];

	/**
	 * Optional sample fields the operator can opt-in via the "+ Add column"
	 * picker. Curated to common MIxS-style fields — operators who need
	 * something exotic can still use the single-sample edit form afterwards.
	 */
	const ADDITIONAL_COLUMNS: ColumnDef[] = [
		{ key: 'env_medium', label: 'Env medium', width: 'w-40' },
		{ key: 'geo_loc_name', label: 'Geo location', width: 'w-40' },
		{ key: 'env_broad_scale', label: 'Env broad scale', width: 'w-40' },
		{ key: 'env_local_scale', label: 'Env local scale', width: 'w-40' },
		{ key: 'depth', label: 'Depth (m)', width: 'w-24' },
		{ key: 'elevation', label: 'Elevation (m)', width: 'w-24' },
		{ key: 'temp', label: 'Temp (°C)', width: 'w-24' },
		{ key: 'salinity', label: 'Salinity', width: 'w-24' },
		{ key: 'ph', label: 'pH', width: 'w-20' },
		{ key: 'volume_filtered_ml', label: 'Vol filtered (mL)', width: 'w-28' },
		{ key: 'filter_type', label: 'Filter type', width: 'w-32' },
		{ key: 'preservation_method', label: 'Preservation', width: 'w-32' }
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

	let projectId = $state('');
	let people = $state<{ personnel_id: string; role?: string | null }[]>([]);
	let rows = $state<Row[]>([emptyRow(), emptyRow(), emptyRow(), emptyRow(), emptyRow()]);
	let saving = $state(false);
	let errorMsg = $state('');
	let result = $state<{ imported: number; failed: number; errors: string[] } | null>(null);
	let extraToAdd = $state('');

	function addRow() { rows = [...rows, emptyRow()]; }
	function removeRow(i: number) {
		// Don't let the user remove row 0 (the template).
		if (i === 0) return;
		rows = rows.filter((_, idx) => idx !== i);
	}

	function addColumn() {
		if (!extraToAdd) return;
		extraColumnKeys = [...extraColumnKeys, extraToAdd];
		// Initialize the new column to '' across all existing rows so the
		// reactive table picks it up cleanly.
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

	/**
	 * Apply the "template" row 0 to every row below it. Only fills empty
	 * cells in each child row — never overwrites data the user has typed.
	 */
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

	/** Paste handler — TSV/CSV splits across rows + cells. */
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

	/** Enter in template row 0 fills that column down. */
	function onTemplateKeydown(e: KeyboardEvent, field: string) {
		if (e.key !== 'Enter') return;
		e.preventDefault();
		const value = rows[0][field];
		rows = rows.map((row, i) => (i === 0 ? row : { ...row, [field]: value }));
	}

	async function submit() {
		errorMsg = '';
		result = null;
		if (!projectId) {
			errorMsg = 'Select a project';
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
				project_id: projectId,
				samp_name: row.samp_name.trim(),
				people
			};
			// Lat/lon assembly
			if (row.latitude && row.longitude) {
				const lat = Number(row.latitude);
				const lon = Number(row.longitude);
				if (!isNaN(lat) && !isNaN(lon)) {
					const ns = lat >= 0 ? 'N' : 'S';
					const ew = lon >= 0 ? 'E' : 'W';
					body.lat_lon = `${Math.abs(lat).toFixed(4)} ${ns} ${Math.abs(lon).toFixed(4)} ${ew}`;
					body.latitude = lat;
					body.longitude = lon;
				}
			}
			// Copy any non-empty value from every other column straight through
			// (the API + zod will coerce strings → numbers where needed).
			for (const col of columns) {
				if (col.key === 'samp_name' || col.key === 'latitude' || col.key === 'longitude') continue;
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

	<p class="text-slate-400 text-sm">
		Paste or type multiple rows at once. Only <span class="text-white">name</span> is required;
		every other field defaults to the MIxS <code>not collected</code> sentinel and can be filled
		in later via the single-sample edit form.
	</p>

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

	<div class="flex gap-4 items-end flex-wrap">
		<div>
			<label class="block text-xs font-medium text-slate-400 mb-1">Project</label>
			<select
				bind:value={projectId}
				class="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-ocean-500"
			>
				<option value="">Select project...</option>
				{#each data.projects as p}<option value={p.id}>{p.project_name}</option>{/each}
			</select>
		</div>
		{#if availableExtras.length > 0}
		<div>
			<label class="block text-xs font-medium text-slate-400 mb-1">+ Add column</label>
			<div class="flex gap-2">
				<select
					bind:value={extraToAdd}
					class="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:border-ocean-500"
				>
					<option value="">Pick a field…</option>
					{#each availableExtras as col}<option value={col.key}>{col.label}</option>{/each}
				</select>
				<button
					type="button"
					onclick={addColumn}
					disabled={!extraToAdd}
					class="px-3 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 disabled:opacity-40 transition-colors text-sm"
				>Add</button>
			</div>
		</div>
		{/if}
		<p class="text-xs text-slate-500 pb-2 flex-1 min-w-64">
			Paste a block of rows from a spreadsheet to auto-fill.
			Row <span class="text-ocean-400">⭐</span> is a template (never imported) —
			press <kbd class="text-ocean-400">Enter</kbd> in any of its cells to fill that column down,
			or
			<button type="button" onclick={applyTemplate} class="text-ocean-400 hover:text-ocean-300 underline">
				apply all to empty cells
			</button>.
		</p>
	</div>

	<PeoplePicker
		bind:people
		personnel={data.personnel}
		roleOptions={data.picklists.person_role}
		defaultRole="collector"
		label="People (applied to all rows)"
	/>

	<div class="overflow-x-auto rounded-lg border border-slate-800">
		<table class="w-full text-sm">
			<thead>
				<tr class="bg-slate-900 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
					<th class="px-2 py-2 text-left font-medium w-10">#</th>
					{#each columns as col}
						<th class="px-2 py-2 text-left font-medium {col.width ?? ''}">
							<div class="flex items-center gap-1">
								<span>{col.label}</span>
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
					<th class="w-8"></th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row, i}
					{@const isTpl = i === 0}
					<tr class="border-b border-slate-800/50 {isTpl ? 'bg-ocean-900/20' : ''}">
						<td class="px-2 py-1 text-slate-500 text-xs font-mono">
							{#if isTpl}
								<span class="text-ocean-400" title="Template — Enter in any cell fills the column">⭐</span>
							{:else}
								{i}
							{/if}
						</td>
						{#each columns as col}
							<td class="px-2 py-1">
								<input
									type="text"
									bind:value={rows[i][col.key]}
									onpaste={(e) => handlePaste(e, i, col.key)}
									onkeydown={isTpl ? (e) => onTemplateKeydown(e, col.key) : undefined}
									placeholder={col.placeholder}
									class={inputCls}
								/>
							</td>
						{/each}
						<td class="px-2 py-1">
							<button
								type="button"
								onclick={() => removeRow(i)}
								class="text-slate-600 hover:text-red-400 text-xs"
								title="Remove row"
							>✕</button>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="flex gap-3 pt-1">
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
			disabled={saving || nonEmptyRows.length === 0 || !projectId}
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
</div>
