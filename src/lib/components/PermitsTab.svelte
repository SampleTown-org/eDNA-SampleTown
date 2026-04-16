<script lang="ts">
	/**
	 * Cross-cutting permits view for the Settings page.
	 *
	 * Since project linkage is derived (via sites.project_id), this tab is
	 * reporting-first: every permit is listed with a rollup of the sites
	 * (and via those, the projects) it touches. Per-site attachment + the
	 * date-window editor live on the site detail pages — not here.
	 *
	 * What this tab supports:
	 *   - Create a permit record (the authoritative document itself)
	 *   - Edit the permit's metadata (name, identifier, notes, etc.) in place
	 *   - Delete a permit entirely
	 *   - Bulk-apply a saved cart: pulls every unique site referenced in the
	 *     cart (directly or via sample→site) and upserts a scope row on the
	 *     chosen permit.
	 */

	import type { Permit, PermitType } from '$lib/types';

	type PermitWithScopes = Permit & {
		scopes: Array<{
			site_id: string;
			site_name: string;
			project_id: string;
			project_name: string;
			valid_from: string | null;
			valid_until: string | null;
		}>;
	};

	type SavedCart = { id: string; name: string; item_count: number };

	type Props = {
		searchQuery: string;
		inputCls: string;
	};
	let { searchQuery, inputCls }: Props = $props();

	const PERMIT_TYPE_LABELS: Record<PermitType, string> = {
		collecting: 'Collecting permit',
		export: 'Export permit',
		import: 'Import permit',
		ircc: 'IRCC',
		pic: 'Prior Informed Consent',
		mat: 'Mutually Agreed Terms',
		mta: 'Material Transfer Agreement',
		ethics: 'Ethics / IRB',
		community_agreement: 'Community agreement',
		dua: 'Data Use Agreement',
		other: 'Other'
	};
	const PERMIT_TYPES = Object.keys(PERMIT_TYPE_LABELS) as PermitType[];

	let permits = $state<PermitWithScopes[]>([]);
	let carts = $state<SavedCart[]>([]);
	let loading = $state(true);
	let error = $state('');

	type MetaForm = {
		permit_type: PermitType;
		name: string;
		identifier: string;
		issuer: string;
		jurisdiction: string;
		document_url: string;
		notes: string;
	};

	function emptyForm(): MetaForm {
		return {
			permit_type: 'collecting',
			name: '',
			identifier: '',
			issuer: '',
			jurisdiction: '',
			document_url: '',
			notes: ''
		};
	}

	let editingId = $state<string | null>(null);
	let form = $state<MetaForm>(emptyForm());
	let showAdd = $state(false);

	async function load() {
		loading = true;
		error = '';
		try {
			const [p, c] = await Promise.all([
				fetch('/api/permits').then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))),
				fetch('/api/saved-carts').then((r) => (r.ok ? r.json() : []))
			]);
			permits = p;
			carts = Array.isArray(c) ? c : [];
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
	});

	function startEdit(p: PermitWithScopes) {
		editingId = p.id;
		form = {
			permit_type: p.permit_type,
			name: p.name,
			identifier: p.identifier ?? '',
			issuer: p.issuer ?? '',
			jurisdiction: p.jurisdiction ?? '',
			document_url: p.document_url ?? '',
			notes: p.notes ?? ''
		};
		showAdd = false;
	}

	async function save() {
		error = '';
		try {
			if (editingId) {
				// PUT with scopes omitted — the API only replaces scopes when the
				// caller actually sends them. Metadata-only updates are safe.
				const res = await fetch(`/api/permits/${editingId}`, {
					method: 'PUT',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(form)
				});
				if (!res.ok) throw new Error(await errorText(res));
			} else {
				const res = await fetch('/api/permits', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ ...form, scopes: [] })
				});
				if (!res.ok) throw new Error(await errorText(res));
			}
			editingId = null;
			showAdd = false;
			form = emptyForm();
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	async function remove(p: PermitWithScopes) {
		if (!confirm(`Delete "${p.name}"? This also removes all ${p.scopes.length} site link(s). Samples previously covered will become uncovered.`)) return;
		error = '';
		try {
			const res = await fetch(`/api/permits/${p.id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	async function errorText(r: Response) {
		const d = await r.json().catch(() => null);
		return d?.error ?? `HTTP ${r.status}`;
	}

	// --- Add cart to permit -----------------------------------------------
	let addCartPermitId = $state<string | null>(null);
	let addCartCartId = $state('');
	let addCartFrom = $state('');
	let addCartUntil = $state('');
	let addCartBusy = $state(false);
	let addCartResult = $state('');

	function startAddCart(p: PermitWithScopes) {
		addCartPermitId = p.id;
		addCartCartId = '';
		addCartFrom = '';
		addCartUntil = '';
		addCartResult = '';
		error = '';
	}

	async function doAddCart() {
		if (!addCartPermitId || !addCartCartId) return;
		addCartBusy = true;
		error = '';
		addCartResult = '';
		try {
			const res = await fetch('/api/permits/add-cart', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					permit_id: addCartPermitId,
					cart_id: addCartCartId,
					valid_from: addCartFrom || null,
					valid_until: addCartUntil || null
				})
			});
			if (!res.ok) throw new Error(await errorText(res));
			const body = await res.json();
			addCartResult = `Linked ${body.sites_linked} site(s).`;
			await load();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			addCartBusy = false;
		}
	}

	// --- Derived list ------------------------------------------------------

	const filteredPermits = $derived.by(() => {
		const q = searchQuery.trim().toLowerCase();
		if (!q) return permits;
		return permits.filter((p) =>
			[p.name, p.identifier, p.issuer, p.jurisdiction, PERMIT_TYPE_LABELS[p.permit_type]]
				.filter(Boolean)
				.some((v) => (v as string).toLowerCase().includes(q))
		);
	});

	// Rollup: per-permit, unique project names and site count.
	function rollup(p: PermitWithScopes) {
		const projects = new Set(p.scopes.map((s) => s.project_name));
		return { projectCount: projects.size, projectNames: Array.from(projects).sort().join(', '), siteCount: p.scopes.length };
	}
</script>

<div class="space-y-4">
	<p class="text-sm text-slate-400">
		Cross-cutting view of every permit in the lab. Project coverage is derived
		from each permit&rsquo;s linked sites — add or remove sites from the site
		detail page, not here. Vocabulary follows the
		<a
			class="text-ocean-400 hover:text-ocean-300"
			href="https://wiki.ggbn.org/ggbn/Permits_and_Contracts_and_Terms_for_Biological_Specimens"
			target="_blank"
			rel="noopener noreferrer">GGBN Darwin Core permit extension</a
		>.
	</p>

	{#if error}
		<div class="p-2 rounded bg-red-900/30 border border-red-800 text-red-300 text-sm">{error}</div>
	{/if}

	{#if loading}
		<p class="text-sm text-slate-500">Loading…</p>
	{:else}
		<div class="space-y-2">
			{#each filteredPermits as p (p.id)}
				{@const r = rollup(p)}
				<div class="p-3 rounded-lg bg-slate-800/50 space-y-1">
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0">
							<span class="text-white font-medium">{p.name}</span>
							<span class="ml-2 text-xs text-ocean-400">{PERMIT_TYPE_LABELS[p.permit_type]}</span>
						</div>
						<div class="flex gap-2 shrink-0">
							<button onclick={() => startAddCart(p)} class="text-xs text-slate-500 hover:text-ocean-400">+ Cart</button>
							<button onclick={() => startEdit(p)} class="text-xs text-slate-500 hover:text-ocean-400">Edit</button>
							<button onclick={() => remove(p)} class="text-xs text-slate-600 hover:text-red-400">Del</button>
						</div>
					</div>
					<div class="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400">
						{#if p.identifier}<span>ID: <span class="text-slate-300 font-mono">{p.identifier}</span></span>{/if}
						{#if p.issuer}<span>Issuer: <span class="text-slate-300">{p.issuer}</span></span>{/if}
						{#if p.jurisdiction}<span>Jurisdiction: <span class="text-slate-300">{p.jurisdiction}</span></span>{/if}
					</div>
					<div class="text-xs text-slate-500">
						{#if r.siteCount === 0}
							<span class="text-amber-400">No sites attached (permit is inert).</span>
						{:else}
							Covers <span class="text-slate-300">{r.siteCount} site{r.siteCount === 1 ? '' : 's'}</span>
							across <span class="text-slate-300">{r.projectCount} project{r.projectCount === 1 ? '' : 's'}</span>
							{#if r.projectNames}<span class="text-slate-600"> — {r.projectNames}</span>{/if}
						{/if}
					</div>
					{#if p.scopes.length > 0}
						<details class="text-xs text-slate-500">
							<summary class="cursor-pointer hover:text-slate-300">Site-by-site</summary>
							<ul class="mt-1 ml-3 space-y-0.5">
								{#each p.scopes as s}
									<li>
										<a href="/sites/{s.site_id}" class="text-ocean-400 hover:text-ocean-300">{s.site_name}</a>
										<span class="text-slate-600">
											· {s.project_name} · {s.valid_from ?? '—'} → {s.valid_until ?? '—'}
										</span>
									</li>
								{/each}
							</ul>
						</details>
					{/if}
					{#if p.document_url}
						<div class="text-xs">
							<a href={p.document_url} target="_blank" rel="noopener noreferrer" class="text-ocean-400 hover:text-ocean-300">↗ Document</a>
						</div>
					{/if}

					{#if addCartPermitId === p.id}
						<form
							onsubmit={(e) => { e.preventDefault(); doAddCart(); }}
							class="mt-2 p-2 rounded bg-slate-900/40 border border-ocean-700 space-y-2"
						>
							<p class="text-xs font-medium text-ocean-400">Add cart to permit</p>
							<p class="text-xs text-slate-500">
								Every unique site referenced in the chosen cart (directly or via
								sample → site) gets a scope row on this permit with the window below.
							</p>
							<select bind:value={addCartCartId} required class="w-full {inputCls} text-xs">
								<option value="">Select a saved cart…</option>
								{#each carts as c}
									<option value={c.id}>{c.name} ({c.item_count} item{c.item_count === 1 ? '' : 's'})</option>
								{/each}
							</select>
							<div class="grid grid-cols-2 gap-2">
								<div>
									<label class="block text-[10px] text-slate-500 mb-0.5">Valid from</label>
									<input type="date" bind:value={addCartFrom} class="w-full {inputCls} text-xs" />
								</div>
								<div>
									<label class="block text-[10px] text-slate-500 mb-0.5">Valid until</label>
									<input type="date" bind:value={addCartUntil} class="w-full {inputCls} text-xs" />
								</div>
							</div>
							<div class="flex items-center gap-2">
								<button type="submit" disabled={addCartBusy || !addCartCartId} class="px-3 py-1 bg-ocean-600 text-white text-xs rounded hover:bg-ocean-500 disabled:opacity-50">
									{addCartBusy ? 'Linking…' : 'Link'}
								</button>
								<button type="button" onclick={() => (addCartPermitId = null)} class="px-3 py-1 border border-slate-700 text-slate-300 text-xs rounded hover:bg-slate-800">Close</button>
								{#if addCartResult}<span class="text-xs text-green-400">{addCartResult}</span>{/if}
							</div>
						</form>
					{/if}
				</div>
			{/each}
			{#if filteredPermits.length === 0}
				<p class="text-sm text-slate-500 italic">
					{permits.length === 0 ? 'No permits yet.' : 'No permits match the filter.'}
				</p>
			{/if}
		</div>

		{#if editingId || showAdd}
			<form
				onsubmit={(e) => { e.preventDefault(); save(); }}
				class="space-y-3 p-4 bg-slate-800/30 rounded-lg border border-ocean-700"
			>
				<p class="text-sm font-medium text-ocean-400">{editingId ? 'Editing permit' : 'New permit'}</p>
				<p class="text-xs text-slate-500">
					Site attachment (+ per-site date window) is managed on each site&rsquo;s detail page.
					You can create the permit record here first, then link sites from there.
				</p>
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
						<input type="text" bind:value={form.jurisdiction} maxlength="10" class="w-full {inputCls} text-sm" placeholder="CA / US-AK / …" />
					</div>
					<div>
						<label class="block text-xs text-slate-400 mb-1">Document URL</label>
						<input type="url" bind:value={form.document_url} class="w-full {inputCls} text-sm" />
					</div>
				</div>
				<div>
					<label class="block text-xs text-slate-400 mb-1">Notes</label>
					<textarea bind:value={form.notes} rows="2" class="w-full {inputCls} text-sm"></textarea>
				</div>
				<div class="flex gap-2">
					<button type="submit" class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 text-sm font-medium">{editingId ? 'Save changes' : 'Create permit'}</button>
					<button type="button" onclick={() => { editingId = null; showAdd = false; form = emptyForm(); }} class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 text-sm font-medium">Cancel</button>
				</div>
			</form>
		{:else}
			<button onclick={() => { showAdd = true; editingId = null; form = emptyForm(); }} class="text-sm font-medium text-ocean-400 hover:text-ocean-300">+ New permit</button>
		{/if}
	{/if}
</div>
