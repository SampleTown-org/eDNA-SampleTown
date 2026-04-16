<script lang="ts">
	/**
	 * Permits / MOUs / licenses management UI for the Settings page.
	 *
	 * Permits are lab-scoped. Vocabulary for `permit_type` mirrors the GGBN
	 * Darwin Core permit-extension terms. A permit covers samples via two
	 * independent axes:
	 *   - project_ids: which projects the permit blankets
	 *   - scopes: site + date-range windows (NULL site = all sites)
	 *
	 * The coverage math lives server-side (src/lib/server/permit-coverage.ts);
	 * this component only manages the permit records themselves.
	 */

	import type { Permit, PermitScope, PermitType, Project, Site } from '$lib/types';

	type PermitWithLinks = Permit & {
		project_ids: string[];
		scopes: PermitScope[];
	};

	type Props = {
		projects: Project[];
		sites: Site[];
		searchQuery: string;
		inputCls: string;
	};
	let { projects, sites, searchQuery, inputCls }: Props = $props();

	// Human labels for the GGBN vocabulary. Kept here (not the DB) because the
	// vocab is a short, stable list; a picklist would be overkill.
	const PERMIT_TYPE_LABELS: Record<PermitType, string> = {
		collecting: 'Collecting permit',
		export: 'Export permit',
		import: 'Import permit',
		ircc: 'IRCC (Internationally Recognized Certificate of Compliance)',
		pic: 'Prior Informed Consent (PIC)',
		mat: 'Mutually Agreed Terms (MAT)',
		mta: 'Material Transfer Agreement (MTA)',
		ethics: 'Ethics / IRB approval',
		community_agreement: 'Community / Indigenous agreement',
		dua: 'Data Use Agreement (DUA)',
		other: 'Other'
	};
	const PERMIT_TYPES = Object.keys(PERMIT_TYPE_LABELS) as PermitType[];

	let permits = $state<PermitWithLinks[]>([]);
	let loading = $state(true);
	let error = $state('');

	type PermitForm = {
		permit_type: PermitType;
		name: string;
		identifier: string;
		issuer: string;
		jurisdiction: string;
		document_url: string;
		notes: string;
		project_ids: string[];
		scopes: Array<{ site_id: string; valid_from: string; valid_until: string; notes: string }>;
	};

	function emptyForm(): PermitForm {
		return {
			permit_type: 'collecting',
			name: '',
			identifier: '',
			issuer: '',
			jurisdiction: '',
			document_url: '',
			notes: '',
			project_ids: [],
			scopes: []
		};
	}

	let editingId = $state<string | null>(null);
	let form = $state<PermitForm>(emptyForm());
	let showAdd = $state(false);

	async function load() {
		loading = true;
		error = '';
		try {
			const r = await fetch('/api/permits');
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			permits = await r.json();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
	});

	function startEdit(p: PermitWithLinks) {
		editingId = p.id;
		form = {
			permit_type: p.permit_type,
			name: p.name,
			identifier: p.identifier ?? '',
			issuer: p.issuer ?? '',
			jurisdiction: p.jurisdiction ?? '',
			document_url: p.document_url ?? '',
			notes: p.notes ?? '',
			project_ids: [...p.project_ids],
			scopes: p.scopes.map((s) => ({
				site_id: s.site_id ?? '',
				valid_from: s.valid_from ?? '',
				valid_until: s.valid_until ?? '',
				notes: s.notes ?? ''
			}))
		};
		showAdd = false;
	}

	function cancelEdit() {
		editingId = null;
		form = emptyForm();
	}

	function startAdd() {
		showAdd = true;
		editingId = null;
		form = emptyForm();
	}

	function addScopeRow() {
		form.scopes = [...form.scopes, { site_id: '', valid_from: '', valid_until: '', notes: '' }];
	}

	function removeScopeRow(i: number) {
		form.scopes = form.scopes.filter((_, idx) => idx !== i);
	}

	async function save() {
		error = '';
		const body = {
			permit_type: form.permit_type,
			name: form.name.trim(),
			identifier: form.identifier,
			issuer: form.issuer,
			jurisdiction: form.jurisdiction,
			document_url: form.document_url,
			notes: form.notes,
			project_ids: form.project_ids,
			scopes: form.scopes.map((s) => ({
				site_id: s.site_id || null,
				valid_from: s.valid_from,
				valid_until: s.valid_until,
				notes: s.notes
			}))
		};
		try {
			const r = editingId
				? await fetch(`/api/permits/${editingId}`, {
						method: 'PUT',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(body)
					})
				: await fetch('/api/permits', {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(body)
					});
			if (!r.ok) {
				const data = await r.json().catch(() => null);
				throw new Error(data?.error ?? `HTTP ${r.status}`);
			}
			cancelEdit();
			showAdd = false;
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	async function remove(id: string) {
		if (!confirm('Delete this permit? This will also remove its project links and scope rows. Samples previously covered by this permit will become uncovered.')) return;
		error = '';
		try {
			const r = await fetch(`/api/permits/${id}`, { method: 'DELETE' });
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	const projectsById = $derived(new Map(projects.map((p) => [p.id, p])));
	const sitesById = $derived(new Map(sites.map((s) => [s.id, s])));

	const filteredPermits = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return permits;
		return permits.filter((p) =>
			[p.name, p.identifier, p.issuer, p.jurisdiction, PERMIT_TYPE_LABELS[p.permit_type]]
				.filter(Boolean)
				.some((v) => (v as string).toLowerCase().includes(q))
		);
	});

	function fmtDate(s: string | null) {
		return s || '—';
	}

	function scopeSummary(scopes: PermitScope[]): string {
		if (scopes.length === 0) return 'no scope rows (permit is inert)';
		return scopes
			.map((s) => {
				const where = s.site_id ? sitesById.get(s.site_id)?.site_name ?? '?' : 'all sites';
				const from = s.valid_from ?? '—';
				const until = s.valid_until ?? '—';
				return `${where} ${from} → ${until}`;
			})
			.join('; ');
	}
</script>

<div class="space-y-4">
	<p class="text-sm text-slate-400">
		Permits, MOUs, licenses, and community agreements authorize sample collection. Vocabulary
		follows the
		<a
			class="text-ocean-400 hover:text-ocean-300"
			href="https://wiki.ggbn.org/ggbn/Permits_and_Contracts_and_Terms_for_Biological_Specimens"
			target="_blank"
			rel="noopener noreferrer">GGBN Darwin Core permit extension</a
		>. A sample is &ldquo;covered&rdquo; by a permit when the permit is linked to the sample&rsquo;s
		project AND has a scope row matching the sample&rsquo;s site (or &ldquo;all sites&rdquo;) AND
		the sample&rsquo;s collection date falls within the scope&rsquo;s validity window.
	</p>

	{#if error}
		<div class="p-2 rounded bg-red-900/30 border border-red-800 text-red-300 text-sm">{error}</div>
	{/if}

	{#if loading}
		<p class="text-sm text-slate-500">Loading…</p>
	{:else}
		<div class="space-y-2">
			{#each filteredPermits as p (p.id)}
				<div class="p-3 rounded-lg bg-slate-800/50 space-y-1">
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0">
							<span class="text-white font-medium">{p.name}</span>
							<span class="ml-2 text-xs text-ocean-400">{PERMIT_TYPE_LABELS[p.permit_type]}</span>
						</div>
						<div class="flex gap-2 shrink-0">
							<button onclick={() => startEdit(p)} class="text-xs text-slate-500 hover:text-ocean-400">Edit</button>
							<button onclick={() => remove(p.id)} class="text-xs text-slate-600 hover:text-red-400">Del</button>
						</div>
					</div>
					<div class="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400">
						{#if p.identifier}<span>ID: <span class="text-slate-300 font-mono">{p.identifier}</span></span>{/if}
						{#if p.issuer}<span>Issuer: <span class="text-slate-300">{p.issuer}</span></span>{/if}
						{#if p.jurisdiction}<span>Jurisdiction: <span class="text-slate-300">{p.jurisdiction}</span></span>{/if}
					</div>
					<div class="text-xs text-slate-500">
						Projects:
						{#if p.project_ids.length === 0}
							<span class="text-amber-400">none (permit covers nothing)</span>
						{:else}
							<span class="text-slate-300"
								>{p.project_ids.map((pid) => projectsById.get(pid)?.project_name ?? '?').join(', ')}</span
							>
						{/if}
					</div>
					<div class="text-xs text-slate-500">Scope: <span class="text-slate-300">{scopeSummary(p.scopes)}</span></div>
					{#if p.document_url}
						<div class="text-xs">
							<a
								href={p.document_url}
								target="_blank"
								rel="noopener noreferrer"
								class="text-ocean-400 hover:text-ocean-300">↗ Document</a
							>
						</div>
					{/if}
				</div>
			{/each}
			{#if filteredPermits.length === 0 && !loading}
				<p class="text-sm text-slate-500 italic">
					{permits.length === 0 ? 'No permits yet.' : 'No permits match the filter.'}
				</p>
			{/if}
		</div>

		{#if editingId || showAdd}
			<form
				onsubmit={(e) => {
					e.preventDefault();
					save();
				}}
				class="space-y-3 p-4 bg-slate-800/30 rounded-lg border border-ocean-700"
			>
				<p class="text-sm font-medium text-ocean-400">{editingId ? 'Editing permit' : 'New permit'}</p>
				<div class="grid grid-cols-1 md:grid-cols-2 gap-3">
					<div>
						<label class="block text-xs text-slate-400 mb-1">Type</label>
						<select bind:value={form.permit_type} class="w-full {inputCls} text-sm">
							{#each PERMIT_TYPES as t}
								<option value={t}>{PERMIT_TYPE_LABELS[t]}</option>
							{/each}
						</select>
					</div>
					<div>
						<label class="block text-xs text-slate-400 mb-1">Name</label>
						<input type="text" bind:value={form.name} required class="w-full {inputCls} text-sm" />
					</div>
					<div>
						<label class="block text-xs text-slate-400 mb-1">Permit number / IRCC URI</label>
						<input type="text" bind:value={form.identifier} class="w-full {inputCls} text-sm" />
					</div>
					<div>
						<label class="block text-xs text-slate-400 mb-1">Issuer</label>
						<input type="text" bind:value={form.issuer} class="w-full {inputCls} text-sm" />
					</div>
					<div>
						<label class="block text-xs text-slate-400 mb-1">Jurisdiction (ISO country code)</label>
						<input
							type="text"
							bind:value={form.jurisdiction}
							maxlength="10"
							class="w-full {inputCls} text-sm"
							placeholder="CA / US-AK / …"
						/>
					</div>
					<div>
						<label class="block text-xs text-slate-400 mb-1">Document URL (optional)</label>
						<input type="url" bind:value={form.document_url} class="w-full {inputCls} text-sm" />
					</div>
				</div>

				<div>
					<label class="block text-xs text-slate-400 mb-1">Projects covered</label>
					<select
						multiple
						bind:value={form.project_ids}
						class="w-full {inputCls} text-sm h-32"
					>
						{#each projects as p}
							<option value={p.id}>{p.project_name}</option>
						{/each}
					</select>
					<p class="mt-1 text-xs text-slate-500">Cmd/Ctrl-click for multi-select.</p>
				</div>

				<div>
					<div class="flex items-center justify-between mb-1">
						<label class="text-xs text-slate-400">Scopes (site + validity window)</label>
						<button type="button" onclick={addScopeRow} class="text-xs text-ocean-400 hover:text-ocean-300">+ Add scope row</button>
					</div>
					{#if form.scopes.length === 0}
						<p class="text-xs text-slate-500 italic">No scope rows — permit covers nothing until at least one is added.</p>
					{/if}
					<div class="space-y-2">
						{#each form.scopes as scope, i}
							<div class="grid grid-cols-12 gap-2 items-end">
								<div class="col-span-4">
									<label class="block text-[10px] text-slate-500 mb-0.5">Site (empty = all)</label>
									<select bind:value={scope.site_id} class="w-full {inputCls} text-xs">
										<option value="">All sites in linked projects</option>
										{#each sites as s}
											<option value={s.id}>{s.site_name}</option>
										{/each}
									</select>
								</div>
								<div class="col-span-3">
									<label class="block text-[10px] text-slate-500 mb-0.5">Valid from</label>
									<input type="date" bind:value={scope.valid_from} class="w-full {inputCls} text-xs" />
								</div>
								<div class="col-span-3">
									<label class="block text-[10px] text-slate-500 mb-0.5">Valid until</label>
									<input type="date" bind:value={scope.valid_until} class="w-full {inputCls} text-xs" />
								</div>
								<div class="col-span-1">
									<label class="block text-[10px] text-slate-500 mb-0.5">Note</label>
									<input type="text" bind:value={scope.notes} class="w-full {inputCls} text-xs" />
								</div>
								<div class="col-span-1">
									<button type="button" onclick={() => removeScopeRow(i)} class="text-xs text-slate-500 hover:text-red-400">Del</button>
								</div>
							</div>
						{/each}
					</div>
				</div>

				<div>
					<label class="block text-xs text-slate-400 mb-1">Notes</label>
					<textarea bind:value={form.notes} rows="2" class="w-full {inputCls} text-sm"></textarea>
				</div>

				<div class="flex gap-2">
					<button type="submit" class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 text-sm font-medium">{editingId ? 'Save changes' : 'Create permit'}</button>
					<button type="button" onclick={() => { cancelEdit(); showAdd = false; }} class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 text-sm font-medium">Cancel</button>
				</div>
			</form>
		{:else}
			<button onclick={startAdd} class="text-sm font-medium text-ocean-400 hover:text-ocean-300">+ Add permit</button>
		{/if}
	{/if}
</div>
