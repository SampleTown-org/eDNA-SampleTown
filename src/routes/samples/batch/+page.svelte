<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Row = {
		samp_name: string;
		collection_date: string;
		latitude: string;
		longitude: string;
		notes: string;
	};

	const emptyRow = (): Row => ({
		samp_name: '',
		collection_date: '',
		latitude: '',
		longitude: '',
		notes: ''
	});

	let projectId = $state('');
	let rows = $state<Row[]>([emptyRow(), emptyRow(), emptyRow(), emptyRow(), emptyRow()]);
	let saving = $state(false);
	let errorMsg = $state('');
	let result = $state<{ imported: number; failed: number; errors: string[] } | null>(null);

	function addRow() { rows = [...rows, emptyRow()]; }
	function removeRow(i: number) { rows = rows.filter((_, idx) => idx !== i); }

	/** Paste handler — if the user pastes TSV/CSV, split into rows + cells. */
	function handlePaste(e: ClipboardEvent, rowIdx: number, field: keyof Row) {
		const text = e.clipboardData?.getData('text') ?? '';
		if (!text.includes('\t') && !text.includes('\n')) return; // single cell — let default happen
		e.preventDefault();

		const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim());
		const fieldOrder: (keyof Row)[] = ['samp_name', 'collection_date', 'latitude', 'longitude', 'notes'];
		const startFieldIdx = fieldOrder.indexOf(field);

		// Make sure we have enough rows.
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

	/** Rows the user has actually filled in (skips totally-empty rows). */
	const nonEmptyRows = $derived(rows.filter((r) => r.samp_name.trim()));

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
				samp_name: row.samp_name.trim()
			};
			if (row.collection_date) body.collection_date = row.collection_date;
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
			if (row.notes) body.notes = row.notes;

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
			// Full success — clear the form
			rows = [emptyRow(), emptyRow(), emptyRow(), emptyRow(), emptyRow()];
		}
	}

	const inputCls =
		'w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-white text-sm focus:outline-none focus:border-ocean-500';
</script>

<div class="max-w-5xl space-y-6">
	<div class="flex items-baseline justify-between">
		<div>
			<a href="/samples" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Samples</a>
			<h1 class="text-2xl font-bold text-white mt-1">Batch sample entry</h1>
			<p class="text-slate-400 mt-1 text-sm">
				Paste or type multiple rows at once. Only <span class="text-white">name</span> is required;
				every other field defaults to the MIxS <code>not collected</code> sentinel and can be filled
				in later via the single-sample edit form.
			</p>
		</div>
		<a href="/samples/new" class="text-xs text-slate-400 hover:text-ocean-400">Single-sample form &rarr;</a>
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

	<div class="flex gap-4 items-end">
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
		<p class="text-xs text-slate-500 pb-2">
			Tip: paste a block of rows from a spreadsheet — the table auto-fills.
		</p>
	</div>

	<div class="overflow-x-auto rounded-lg border border-slate-800">
		<table class="w-full text-sm">
			<thead>
				<tr class="bg-slate-900 text-xs text-slate-400 uppercase tracking-wider border-b border-slate-800">
					<th class="px-2 py-2 text-left font-medium w-10">#</th>
					<th class="px-2 py-2 text-left font-medium">Sample name *</th>
					<th class="px-2 py-2 text-left font-medium w-36">Collection date</th>
					<th class="px-2 py-2 text-left font-medium w-28">Latitude</th>
					<th class="px-2 py-2 text-left font-medium w-28">Longitude</th>
					<th class="px-2 py-2 text-left font-medium">Notes</th>
					<th class="w-8"></th>
				</tr>
			</thead>
			<tbody>
				{#each rows as row, i}
					<tr class="border-b border-slate-800/50">
						<td class="px-2 py-1 text-slate-500 text-xs font-mono">{i + 1}</td>
						<td class="px-2 py-1">
							<input
								type="text"
								bind:value={row.samp_name}
								onpaste={(e) => handlePaste(e, i, 'samp_name')}
								class={inputCls}
							/>
						</td>
						<td class="px-2 py-1">
							<input
								type="text"
								bind:value={row.collection_date}
								onpaste={(e) => handlePaste(e, i, 'collection_date')}
								placeholder="YYYY-MM-DD"
								class={inputCls}
							/>
						</td>
						<td class="px-2 py-1">
							<input
								type="text"
								bind:value={row.latitude}
								onpaste={(e) => handlePaste(e, i, 'latitude')}
								class={inputCls}
							/>
						</td>
						<td class="px-2 py-1">
							<input
								type="text"
								bind:value={row.longitude}
								onpaste={(e) => handlePaste(e, i, 'longitude')}
								class={inputCls}
							/>
						</td>
						<td class="px-2 py-1">
							<input
								type="text"
								bind:value={row.notes}
								onpaste={(e) => handlePaste(e, i, 'notes')}
								class={inputCls}
							/>
						</td>
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
