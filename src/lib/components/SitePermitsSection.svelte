<script lang="ts">
	/**
	 * Permit-coverage CRUD section for a site detail page.
	 *
	 * A site is covered by a permit when `permit_scopes` has a row with
	 * (permit_id, site_id). The component shows the permits currently covering
	 * this site, lets the operator add or remove permits, and lets them edit
	 * the per-(permit, site) validity window.
	 *
	 * Two add paths:
	 *   - Attach an existing lab-scoped permit (PUT on the permit with the
	 *     merged scope list).
	 *   - Create a brand-new permit (POST /api/permits) and immediately scope
	 *     it to this site.
	 */
	import type { Permit, PermitType } from '$lib/types';
	import { invalidateAll } from '$app/navigation';

	type LinkedPermit = Permit & {
		scope_id: string;
		valid_from: string | null;
		valid_until: string | null;
		scope_notes: string | null;
	};
	type LabPermit = Pick<Permit, 'id' | 'name' | 'permit_type' | 'identifier'>;

	type Props = {
		siteId: string;
		linked: LinkedPermit[];
		labPermits: LabPermit[];
	};
	let { siteId, linked, labPermits }: Props = $props();

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

	const inputCls =
		'w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500 text-sm';

	let error = $state('');
	let busy = $state(false);

	// --- Edit existing scope window ---
	let editingScopeId = $state<string | null>(null);
	let editFrom = $state('');
	let editUntil = $state('');

	function startEdit(p: LinkedPermit) {
		editingScopeId = p.scope_id;
		editFrom = p.valid_from ?? '';
		editUntil = p.valid_until ?? '';
		error = '';
	}

	async function saveWindow(permit: LinkedPermit) {
		busy = true;
		error = '';
		try {
			// Fetch the full permit so we can send back the full scope set with
			// just this (permit, site) window updated — the API is
			// replace-on-update.
			const current = await fetch(`/api/permits/${permit.id}`).then((r) => r.json());
			const scopes = (current.scopes as Array<{ site_id: string; valid_from: string | null; valid_until: string | null; notes: string | null }>)
				.map((s) =>
					s.site_id === siteId
						? { site_id: s.site_id, valid_from: editFrom || null, valid_until: editUntil || null, notes: s.notes }
						: s
				);
			const res = await fetch(`/api/permits/${permit.id}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ...current, scopes })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			editingScopeId = null;
			await invalidateAll();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	async function removeFromSite(permit: LinkedPermit) {
		if (!confirm(`Remove "${permit.name}" from this site? The permit itself stays in the lab.`)) return;
		busy = true;
		error = '';
		try {
			const current = await fetch(`/api/permits/${permit.id}`).then((r) => r.json());
			const scopes = (current.scopes as Array<{ site_id: string; valid_from: string | null; valid_until: string | null; notes: string | null }>)
				.filter((s) => s.site_id !== siteId)
				.map((s) => ({ site_id: s.site_id, valid_from: s.valid_from, valid_until: s.valid_until, notes: s.notes }));
			const res = await fetch(`/api/permits/${permit.id}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ...current, scopes })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			await invalidateAll();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	// --- Attach existing permit ---
	let attachOpen = $state(false);
	let attachPermitId = $state('');
	let attachFrom = $state('');
	let attachUntil = $state('');

	const availablePermits = $derived(
		labPermits.filter((p) => !linked.some((l) => l.id === p.id))
	);

	async function attachExisting() {
		if (!attachPermitId) return;
		busy = true;
		error = '';
		try {
			const current = await fetch(`/api/permits/${attachPermitId}`).then((r) => r.json());
			const scopes = [
				...(current.scopes as Array<{ site_id: string; valid_from: string | null; valid_until: string | null; notes: string | null }>).map((s) => ({
					site_id: s.site_id,
					valid_from: s.valid_from,
					valid_until: s.valid_until,
					notes: s.notes
				})),
				{ site_id: siteId, valid_from: attachFrom || null, valid_until: attachUntil || null, notes: null }
			];
			const res = await fetch(`/api/permits/${attachPermitId}`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ...current, scopes })
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			attachOpen = false;
			attachPermitId = '';
			attachFrom = '';
			attachUntil = '';
			await invalidateAll();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}

	// --- Create a brand-new permit (scoped to this site) ---
	let createOpen = $state(false);
	let newPermit = $state({
		permit_type: 'collecting' as PermitType,
		name: '',
		identifier: '',
		issuer: '',
		jurisdiction: '',
		document_url: '',
		notes: '',
		valid_from: '',
		valid_until: ''
	});

	function resetNew() {
		newPermit = {
			permit_type: 'collecting',
			name: '',
			identifier: '',
			issuer: '',
			jurisdiction: '',
			document_url: '',
			notes: '',
			valid_from: '',
			valid_until: ''
		};
	}

	async function createPermit() {
		if (!newPermit.name.trim()) return;
		busy = true;
		error = '';
		try {
			const body = {
				permit_type: newPermit.permit_type,
				name: newPermit.name,
				identifier: newPermit.identifier,
				issuer: newPermit.issuer,
				jurisdiction: newPermit.jurisdiction,
				document_url: newPermit.document_url,
				notes: newPermit.notes,
				scopes: [
					{
						site_id: siteId,
						valid_from: newPermit.valid_from || null,
						valid_until: newPermit.valid_until || null
					}
				]
			};
			const res = await fetch('/api/permits', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!res.ok) {
				const data = await res.json().catch(() => null);
				throw new Error(data?.error ?? `HTTP ${res.status}`);
			}
			createOpen = false;
			resetNew();
			await invalidateAll();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<div class="rounded-lg border border-slate-800 p-5 space-y-3">
	<div class="flex items-center justify-between">
		<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Permits ({linked.length})</h2>
		<a href="/settings?tab=permits" class="text-xs text-ocean-400 hover:text-ocean-300">All permits →</a>
	</div>

	{#if error}
		<div class="p-2 rounded bg-red-900/30 border border-red-800 text-red-300 text-xs">{error}</div>
	{/if}

	{#if linked.length === 0}
		<p class="text-sm text-amber-400">
			No permits cover this site. Samples collected here will show as uncovered on export.
		</p>
	{:else}
		<ul class="text-sm text-slate-300 space-y-2">
			{#each linked as p}
				<li class="p-2 rounded bg-slate-900/40 space-y-1">
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0">
							<span class="text-white font-medium">{p.name}</span>
							<span class="ml-1 text-xs text-ocean-400">{PERMIT_TYPE_LABELS[p.permit_type]}</span>
							{#if p.identifier}<span class="ml-1 text-xs text-slate-500 font-mono">{p.identifier}</span>{/if}
							{#if p.document_url}
								<a href={p.document_url} target="_blank" rel="noopener noreferrer" class="ml-1 text-xs text-ocean-400 hover:text-ocean-300">↗</a>
							{/if}
						</div>
						<div class="flex gap-2 shrink-0">
							<button onclick={() => startEdit(p)} class="text-xs text-slate-500 hover:text-ocean-400">Edit window</button>
							<button onclick={() => removeFromSite(p)} class="text-xs text-slate-600 hover:text-red-400">Remove</button>
						</div>
					</div>
					{#if editingScopeId === p.scope_id}
						<div class="flex items-end gap-2 pt-1">
							<div>
								<label class="block text-[10px] text-slate-500 mb-0.5">Valid from</label>
								<input type="date" bind:value={editFrom} class={inputCls} />
							</div>
							<div>
								<label class="block text-[10px] text-slate-500 mb-0.5">Valid until</label>
								<input type="date" bind:value={editUntil} class={inputCls} />
							</div>
							<button
								onclick={() => saveWindow(p)}
								disabled={busy}
								class="px-2 py-1 bg-ocean-600 text-white text-xs rounded hover:bg-ocean-500 disabled:opacity-50"
							>Save</button>
							<button
								onclick={() => (editingScopeId = null)}
								class="px-2 py-1 border border-slate-700 text-slate-300 text-xs rounded hover:bg-slate-800"
							>Cancel</button>
						</div>
					{:else}
						<div class="text-xs text-slate-500">
							Valid {p.valid_from ?? '—'} → {p.valid_until ?? '—'}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<div class="flex flex-wrap gap-4 pt-1">
		{#if availablePermits.length > 0}
			<button
				onclick={() => { attachOpen = !attachOpen; createOpen = false; }}
				class="text-sm font-medium text-ocean-400 hover:text-ocean-300"
			>+ Attach existing permit</button>
		{/if}
		<button
			onclick={() => { createOpen = !createOpen; attachOpen = false; }}
			class="text-sm font-medium text-ocean-400 hover:text-ocean-300"
		>+ Create new permit</button>
	</div>

	{#if attachOpen}
		<form
			onsubmit={(e) => { e.preventDefault(); attachExisting(); }}
			class="p-3 rounded-lg bg-slate-800/30 border border-ocean-700 space-y-2"
		>
			<p class="text-xs font-medium text-ocean-400">Attach an existing permit to this site</p>
			<select bind:value={attachPermitId} required class={inputCls}>
				<option value="">Select permit…</option>
				{#each availablePermits as p}
					<option value={p.id}>
						{p.name} ({PERMIT_TYPE_LABELS[p.permit_type]}{p.identifier ? ` · ${p.identifier}` : ''})
					</option>
				{/each}
			</select>
			<div class="grid grid-cols-2 gap-2">
				<div>
					<label class="block text-[10px] text-slate-500 mb-0.5">Valid from</label>
					<input type="date" bind:value={attachFrom} class={inputCls} />
				</div>
				<div>
					<label class="block text-[10px] text-slate-500 mb-0.5">Valid until</label>
					<input type="date" bind:value={attachUntil} class={inputCls} />
				</div>
			</div>
			<div class="flex gap-2">
				<button type="submit" disabled={busy || !attachPermitId} class="px-3 py-1.5 bg-ocean-600 text-white text-sm rounded hover:bg-ocean-500 disabled:opacity-50">Attach</button>
				<button type="button" onclick={() => { attachOpen = false; }} class="px-3 py-1.5 border border-slate-700 text-slate-300 text-sm rounded hover:bg-slate-800">Cancel</button>
			</div>
		</form>
	{/if}

	{#if createOpen}
		<form
			onsubmit={(e) => { e.preventDefault(); createPermit(); }}
			class="p-3 rounded-lg bg-slate-800/30 border border-ocean-700 space-y-2"
		>
			<p class="text-xs font-medium text-ocean-400">Create a new permit (and scope to this site)</p>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
				<div>
					<label class="block text-[10px] text-slate-500 mb-0.5">Type</label>
					<select bind:value={newPermit.permit_type} class={inputCls}>
						{#each PERMIT_TYPES as t}
							<option value={t}>{PERMIT_TYPE_LABELS[t]}</option>
						{/each}
					</select>
				</div>
				<div>
					<label class="block text-[10px] text-slate-500 mb-0.5">Name</label>
					<input type="text" bind:value={newPermit.name} required class={inputCls} />
				</div>
				<div>
					<label class="block text-[10px] text-slate-500 mb-0.5">Permit number / IRCC URI</label>
					<input type="text" bind:value={newPermit.identifier} class={inputCls} />
				</div>
				<div>
					<label class="block text-[10px] text-slate-500 mb-0.5">Issuer</label>
					<input type="text" bind:value={newPermit.issuer} class={inputCls} />
				</div>
				<div>
					<label class="block text-[10px] text-slate-500 mb-0.5">Jurisdiction</label>
					<input type="text" bind:value={newPermit.jurisdiction} placeholder="CA / US-AK / …" class={inputCls} />
				</div>
				<div>
					<label class="block text-[10px] text-slate-500 mb-0.5">Document URL</label>
					<input type="url" bind:value={newPermit.document_url} class={inputCls} />
				</div>
				<div>
					<label class="block text-[10px] text-slate-500 mb-0.5">Valid from</label>
					<input type="date" bind:value={newPermit.valid_from} class={inputCls} />
				</div>
				<div>
					<label class="block text-[10px] text-slate-500 mb-0.5">Valid until</label>
					<input type="date" bind:value={newPermit.valid_until} class={inputCls} />
				</div>
			</div>
			<div>
				<label class="block text-[10px] text-slate-500 mb-0.5">Notes</label>
				<textarea bind:value={newPermit.notes} rows="2" class={inputCls}></textarea>
			</div>
			<div class="flex gap-2">
				<button type="submit" disabled={busy || !newPermit.name.trim()} class="px-3 py-1.5 bg-ocean-600 text-white text-sm rounded hover:bg-ocean-500 disabled:opacity-50">Create & attach</button>
				<button type="button" onclick={() => { createOpen = false; resetNew(); }} class="px-3 py-1.5 border border-slate-700 text-slate-300 text-sm rounded hover:bg-slate-800">Cancel</button>
			</div>
		</form>
	{/if}
</div>
