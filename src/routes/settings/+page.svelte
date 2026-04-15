<script lang="ts">
	import { page } from '$app/stores';
	import LabelGenerator from '$lib/components/LabelGenerator.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	const CATEGORY_LABELS: Record<string, string> = {
		geo_loc_name: 'Geographic Locations',
		locality: 'Localities',
		env_broad_scale: 'Broad-scale Environment',
		env_local_scale: 'Local Environment',
		env_medium: 'Environmental Medium',
		filter_type: 'Filter Types',
		samp_store_sol: 'Sample Storage Solution',
		samp_store_temp: 'Sample Storage Temperature',
		samp_store_loc: 'Sample Storage Location',
		store_cond: 'Storage Conditions',
		samp_collect_device: 'Sample Collection Devices',
		samp_collect_method: 'Sample Collection Methods',
		storage_room: 'Storage Rooms/Freezers',
		storage_box: 'Storage Boxes',
		extraction_method: 'Extraction Methods / Kits',
		library_prep_kit: 'Library Prep Kits',
		library_strategy: 'Strategy',
		library_source: 'Source',
		library_selection: 'Selection',
		seq_platform: 'Platforms',
		seq_instrument: 'Instruments',
		barcode: 'Barcodes',
		person_role: 'Person Roles',
		pipeline: 'Pipelines',
		samp_taxon_id: 'Sample Taxon IDs'
	};

	/** Map picklist categories to their SRA vocabulary section for validation. */
	const SRA_CATEGORY_MAP: Record<string, 'strategies' | 'sources' | 'selections' | 'platforms' | 'instruments'> = {
		library_strategy: 'strategies',
		library_source: 'sources',
		library_selection: 'selections',
		seq_platform: 'platforms',
		seq_instrument: 'instruments'
	};

	// Build SRA valid-value sets for quick lookup
	const sraVocab = data.sraVocabulary;
	const sraValidSets: Record<string, Set<string>> = {
		strategies: new Set((sraVocab?.strategies ?? []).map((s: any) => s.value)),
		sources: new Set((sraVocab?.sources ?? []).map((s: any) => s.value)),
		selections: new Set((sraVocab?.selections ?? []).map((s: any) => s.value)),
		platforms: new Set(Object.keys(sraVocab?.platforms ?? {})),
		instruments: new Set(Object.values(sraVocab?.platforms ?? {}).flat() as string[])
	};

	function isSraValid(category: string, value: string): boolean | null {
		const section = SRA_CATEGORY_MAP[category];
		if (!section) return null; // not an SRA-validated category
		return sraValidSets[section]?.has(value) ?? false;
	}

	/** Picklist categories grouped by vocabulary authority. */
	const VOCAB_GROUPS = [
		{
			label: 'MIxS',
			description: 'Minimum Information about any (x) Sequence — standardized environment descriptors',
			categories: ['geo_loc_name', 'locality', 'env_broad_scale', 'env_local_scale', 'env_medium', 'samp_taxon_id', 'samp_store_sol', 'samp_store_temp', 'samp_store_loc', 'store_cond', 'samp_collect_device', 'samp_collect_method']
		},
		{
			label: 'SRA / ENA',
			description: 'Sequence Read Archive & European Nucleotide Archive — validated against NCBI controlled vocabulary',
			categories: ['library_strategy', 'library_source', 'library_selection', 'seq_platform', 'seq_instrument']
		},
		{
			label: 'SampleTown',
			description: 'Lab-specific vocabulary — storage, kits, roles',
			categories: ['pipeline', 'filter_type', 'storage_room', 'storage_box', 'extraction_method', 'library_prep_kit', 'barcode', 'person_role']
		}
	];

	function vocabGroupFor(cat: string): string {
		for (const g of VOCAB_GROUPS) {
			if (g.categories.includes(cat)) return g.label;
		}
		return 'MIxS';
	}

	type TabType = 'naming' | 'category' | 'primers' | 'protocols' | 'people' | 'feedback' | 'labels' | 'backup' | 'danger';

	// --- Search filter (shared across the list-based tabs, reset on tab switch) ---
	let searchQuery = $state('');
	function resetSearch() { searchQuery = ''; }

	let feedbackItems = $state(structuredClone(data.feedback) as any[]);
	let personnelList = $state(structuredClone(data.personnel) as any[]);
	let userList = $state(structuredClone(data.users) as any[]);
	let inviteList = $state(structuredClone(data.invites) as any[]);

	// New-invite form state. role defaults to 'user' — matches API default.
	let newInvite = $state({ role: 'user', email_hint: '', ttl_days: 14 });
	let inviteCopiedToken = $state<string | null>(null);

	function inviteUrl(token: string): string {
		// Build the absolute URL the admin will share. Using window.location
		// origin so it matches whatever host the admin is currently on
		// (works for staging/prod/localhost without env coupling).
		if (typeof window === 'undefined') return `/auth/join/${token}`;
		return `${window.location.origin}/auth/join/${token}`;
	}

	async function createInvite() {
		const res = await fetch('/api/invites', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				role: newInvite.role,
				email_hint: newInvite.email_hint.trim() || undefined,
				ttl_days: Number(newInvite.ttl_days) || 14
			})
		});
		if (!res.ok) {
			errorMsg = (await res.json().catch(() => ({}))).error || 'Failed to create invite';
			return;
		}
		const created = await res.json();
		// Optimistic row: stamp created_at locally (the API only returns
		// token/role/email_hint/expires_at) and use the current user as
		// the creator. Was pulling data.users[0]'s username, which on a
		// multi-lab admin's view could be a totally different user.
		inviteList = [
			{
				...created,
				created_at: new Date().toISOString(),
				created_by_username: data.user?.username ?? '',
				used_at: null,
				used_by_username: null
			},
			...inviteList
		];
		newInvite = { role: 'user', email_hint: '', ttl_days: 14 };
		// Auto-copy fresh token's URL so the admin can paste-and-send right away.
		try {
			await navigator.clipboard.writeText(inviteUrl(created.token));
			inviteCopiedToken = created.token;
			setTimeout(() => { if (inviteCopiedToken === created.token) inviteCopiedToken = null; }, 2500);
		} catch { /* clipboard blocked — admin can copy from the row */ }
	}

	async function copyInvite(token: string) {
		try {
			await navigator.clipboard.writeText(inviteUrl(token));
			inviteCopiedToken = token;
			setTimeout(() => { if (inviteCopiedToken === token) inviteCopiedToken = null; }, 2500);
		} catch { /* clipboard blocked */ }
	}

	async function revokeInvite(token: string) {
		if (!confirm('Revoke this invite? The link will stop working immediately.')) return;
		const res = await fetch(`/api/invites/${encodeURIComponent(token)}`, { method: 'DELETE' });
		if (res.ok) {
			inviteList = inviteList.filter((i) => i.token !== token);
		} else {
			errorMsg = (await res.json().catch(() => ({}))).error || 'Failed to revoke invite';
		}
	}

	function inviteStatus(i: any): { label: string; cls: string } {
		if (i.used_at) return { label: `used by ${i.used_by_username ?? '(deleted)'}`, cls: 'text-slate-500' };
		if (new Date(i.expires_at) < new Date()) return { label: 'expired', cls: 'text-amber-500' };
		return { label: 'active', cls: 'text-green-400' };
	}

	// --- Backup tab state. Lazy-loaded the first time the tab opens to
	// avoid an extra round-trip on the initial Manage page load. ---
	let backupSettings = $state<{
		github_repo: string | null;
		github_token_set: boolean;
		backup_interval_hours: number | null;
		last_backup_at: string | null;
	} | null>(null);
	let backupHistory = $state<any[]>([]);
	let backupForm = $state({ github_repo: '', github_token: '', backup_interval_hours: 0 });
	let backupLoaded = $state(false);
	let backupBusy = $state(false);
	let backupMsg = $state('');

	async function loadBackupData() {
		if (backupLoaded) return;
		backupLoaded = true;
		const [sRes, hRes] = await Promise.all([
			fetch('/api/lab/settings'),
			fetch('/api/db/snapshots')
		]);
		if (sRes.ok) {
			backupSettings = await sRes.json();
			backupForm.github_repo = backupSettings?.github_repo ?? '';
			backupForm.github_token = '';
			backupForm.backup_interval_hours = backupSettings?.backup_interval_hours ?? 0;
		}
		if (hRes.ok) backupHistory = await hRes.json();
	}

	async function saveBackupSettings() {
		backupBusy = true; backupMsg = '';
		// Empty github_token field = "leave alone" (don't overwrite an existing
		// secret accidentally). Only send the field if the admin actually
		// typed something OR explicitly chose to clear it.
		const body: Record<string, unknown> = {
			github_repo: backupForm.github_repo.trim(),
			backup_interval_hours: Number(backupForm.backup_interval_hours) || null
		};
		if (backupForm.github_token.trim()) body.github_token = backupForm.github_token.trim();
		const res = await fetch('/api/lab/settings', {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		if (!res.ok) {
			backupMsg = (await res.json().catch(() => ({}))).error || 'Save failed';
			backupBusy = false;
			return;
		}
		// Re-fetch so token-set flag and computed values stay in sync.
		backupLoaded = false;
		await loadBackupData();
		backupForm.github_token = '';
		// Immediately verify the saved (repo, token) combo against GitHub
		// so the admin gets a clear ✓/✗ on the form itself instead of
		// having to click Backup now and read the snapshot history to find
		// out their config doesn't actually work. (Beta feedback: a "failed"
		// row in the history made it look like Save was failing.)
		const test = await fetch('/api/lab/settings/test').then((r) => r.json()).catch(() => null);
		if (test?.ok) {
			backupMsg = 'Saved. Connection to GitHub verified.';
		} else if (test) {
			const status = test.status ? ` (HTTP ${test.status})` : '';
			backupMsg = `Saved, but couldn\u2019t reach the repo${status}: ${test.hint ?? test.error}`;
		} else {
			backupMsg = 'Saved.';
		}
		backupBusy = false;
	}

	// --- Danger zone: delete the entire lab ---
	let deleteLabConfirm = $state('');
	let deleteLabBusy = $state(false);
	let deleteLabError = $state('');

	async function deleteLab() {
		deleteLabBusy = true; deleteLabError = '';
		const res = await fetch('/api/lab', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ confirm: deleteLabConfirm })
		});
		if (res.ok) {
			// All lab data wiped, caller's lab_id is now NULL → next request
			// gets bounced to /auth/setup-lab. Send them there directly.
			window.location.href = '/auth/setup-lab';
			return;
		}
		deleteLabError = (await res.json().catch(() => ({}))).error || 'Delete failed';
		deleteLabBusy = false;
	}

	// --- Restore from backup state ---
	let restoreCommits = $state<{ sha: string; message: string; date: string }[]>([]);
	let restoreLoading = $state(false);
	let restoreCommitSha = $state('');
	let restoreConfirm = $state('');
	let restoreBusy = $state(false);
	let restoreMsg = $state('');
	let restoreOpen = $state(false);

	async function loadRestoreCommits() {
		restoreLoading = true; restoreMsg = '';
		const res = await fetch('/api/db/restore/commits');
		const body = await res.json().catch(() => null);
		if (body?.ok) {
			restoreCommits = body.commits;
			if (restoreCommits.length === 0) {
				restoreMsg = 'No snapshots found in the configured repo. Push a backup first.';
			}
		} else {
			restoreMsg = body?.hint ?? body?.error ?? 'Could not list commits';
		}
		restoreLoading = false;
	}

	async function runRestore() {
		if (!restoreCommitSha) { restoreMsg = 'Pick a snapshot to restore from.'; return; }
		restoreBusy = true; restoreMsg = '';
		const res = await fetch('/api/db/restore', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ commit_sha: restoreCommitSha, confirm: restoreConfirm })
		});
		const body = await res.json().catch(() => null);
		if (res.ok && body?.ok) {
			const total = Object.values(body.counts as Record<string, number>).reduce((s, n) => s + n, 0);
			const missingNote = body.missing?.length ? ` (skipped ${body.missing.length} table${body.missing.length === 1 ? '' : 's'} not in this snapshot)` : '';
			restoreMsg = `Restored ${total} rows across ${Object.keys(body.counts).length} tables${missingNote}. Reload to see your data.`;
			restoreCommitSha = '';
			restoreConfirm = '';
		} else {
			restoreMsg = body?.error ?? body?.hint ?? `Restore failed (HTTP ${res.status})`;
		}
		restoreBusy = false;
	}

	async function runBackupNow() {
		backupBusy = true; backupMsg = '';
		const res = await fetch('/api/db/snapshot', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ message: `Manual snapshot ${new Date().toISOString()}` })
		});
		if (res.ok) {
			const r = await res.json();
			if (r.unchanged) {
				backupMsg = 'No data changes since last snapshot — nothing to commit.';
			} else {
				backupMsg = `Pushed commit ${r.sha?.slice(0, 7) ?? ''}`;
			}
		} else {
			backupMsg = (await res.json().catch(() => ({}))).error || 'Backup failed';
		}
		// Refresh history + last_backup_at
		backupLoaded = false;
		await loadBackupData();
		backupBusy = false;
	}

	// Search-filtered views (matches helper is defined further down in script).
	let filteredPersonnel = $derived(
		(() => {
			if (!searchQuery.trim()) return personnelList;
			const q = searchQuery.toLowerCase();
			return personnelList.filter((p: any) =>
				[p.full_name, p.role, p.email, p.institution, p.github_username].some((s) =>
					typeof s === 'string' && s.toLowerCase().includes(q)
				)
			);
		})()
	);
	let filteredUsers = $derived(
		(() => {
			if (!searchQuery.trim()) return userList;
			const q = searchQuery.toLowerCase();
			return userList.filter((u: any) =>
				[u.username, u.display_name, u.email, u.role].some((s) =>
					typeof s === 'string' && s.toLowerCase().includes(q)
				)
			);
		})()
	);
	let filteredFeedback = $derived(
		(() => {
			if (!searchQuery.trim()) return feedbackItems;
			const q = searchQuery.toLowerCase();
			return feedbackItems.filter((f: any) =>
				[f.message, f.username, f.page_url, f.status].some((s) =>
					typeof s === 'string' && s.toLowerCase().includes(q)
				)
			);
		})()
	);

	// --- User accounts CRUD ---
	const USER_ROLES = ['admin', 'user', 'viewer'] as const;
	const emptyNewUser = () => ({ username: '', display_name: '', email: '', role: 'user' as string, password: '' });
	let newUser = $state(emptyNewUser());
	let resetPwdId = $state('');
	let resetPwdValue = $state('');

	async function addUser() {
		clearMsg();
		if (!newUser.username.trim() || newUser.password.length < 10) {
			errorMsg = 'Username and a password of at least 10 characters are required';
			return;
		}
		const res = await fetch('/api/users', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(newUser)
		});
		if (res.ok) {
			userList = [...userList, await res.json()];
			newUser = emptyNewUser();
		} else {
			errorMsg = (await res.json().catch(() => ({}))).error || 'Failed to create user';
		}
	}

	async function approveUser(u: any) {
		clearMsg();
		const res = await fetch(`/api/users/${u.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ is_approved: 1 })
		});
		if (res.ok) {
			const updated = await res.json();
			userList = userList.map((x) => (x.id === u.id ? updated : x));
		} else {
			errorMsg = (await res.json().catch(() => ({}))).error || 'Failed';
		}
	}

	async function changeUserRole(u: any, role: string) {
		clearMsg();
		const res = await fetch(`/api/users/${u.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ role })
		});
		if (res.ok) {
			const updated = await res.json();
			userList = userList.map((x) => (x.id === u.id ? updated : x));
		} else {
			errorMsg = (await res.json().catch(() => ({}))).error || 'Failed';
		}
	}

	async function deleteUser(u: any) {
		if (!confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
		clearMsg();
		const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
		if (res.ok) {
			userList = userList.filter((x) => x.id !== u.id);
		} else {
			errorMsg = (await res.json().catch(() => ({}))).error || 'Failed';
		}
	}

	function startResetPwd(u: any) {
		resetPwdId = u.id;
		resetPwdValue = '';
	}

	async function submitResetPwd() {
		clearMsg();
		if (resetPwdValue.length < 10) {
			errorMsg = 'New password must be at least 10 characters';
			return;
		}
		const res = await fetch(`/api/users/${resetPwdId}/reset-password`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ password: resetPwdValue })
		});
		if (res.ok) {
			// Refresh the row to show must_change_password=1
			userList = userList.map((u) =>
				u.id === resetPwdId ? { ...u, must_change_password: 1, has_password: 1 } : u
			);
			resetPwdId = '';
			resetPwdValue = '';
		} else {
			errorMsg = (await res.json().catch(() => ({}))).error || 'Failed';
		}
	}

	// --- Personnel CRUD ---
	/** Options for the Personnel role dropdown. Pulled from the person_role
	 *  picklist (managed via the Picklists tab) + any role value that an
	 *  existing person already has — so editing legacy rows doesn't silently
	 *  blank out a role that isn't in the picklist yet. */
	const personRoleOptions = $derived.by<string[]>(() => {
		const picklist = (data.categories?.person_role ?? []).map((v: any) => v.value);
		const used = new Set<string>();
		for (const p of personnelList) if (p?.role) used.add(p.role as string);
		const merged = [...picklist];
		for (const u of used) if (!merged.some((v) => v.toLowerCase() === u.toLowerCase())) merged.push(u);
		return merged;
	});
	const emptyPerson = () => ({ full_name: '', email: '', role: '', institution: '', orcid: '', user_id: '' });
	let newPerson = $state(emptyPerson());
	let editingPersonId = $state('');
	let editPerson = $state(emptyPerson());

	async function addPerson() {
		if (!newPerson.full_name.trim()) return; clearMsg();
		const res = await fetch('/api/personnel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newPerson) });
		if (res.ok) { personnelList = [...personnelList, await res.json()]; newPerson = emptyPerson(); }
		else { errorMsg = (await res.json().catch(() => ({}))).error || 'Failed'; }
	}

	function startEditPerson(p: any) {
		editingPersonId = p.id;
		editPerson = { full_name: p.full_name, email: p.email || '', role: p.role || '', institution: p.institution || '', orcid: p.orcid || '', user_id: p.user_id || '' };
	}

	async function saveEditPerson() {
		if (!editPerson.full_name.trim()) return; clearMsg();
		const res = await fetch(`/api/personnel/${editingPersonId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editPerson) });
		if (res.ok) { const updated = await res.json(); personnelList = personnelList.map(p => p.id === editingPersonId ? updated : p); editingPersonId = ''; }
		else { errorMsg = (await res.json().catch(() => ({}))).error || 'Failed'; }
	}

	async function removePerson(id: string) {
		if (!confirm('Remove this person?')) return;
		await fetch(`/api/personnel/${id}`, { method: 'DELETE' });
		personnelList = personnelList.filter(p => p.id !== id);
	}

	async function resolveFeedback(id: string, status: 'open' | 'resolved' | 'wontfix') {
		const res = await fetch(`/api/feedback/${id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ status })
		});
		if (res.ok) {
			feedbackItems = feedbackItems.map((f) => (f.id === id ? { ...f, status } : f));
		} else {
			errorMsg = (await res.json().catch(() => ({}))).error || 'Failed to update feedback';
		}
	}

	async function deleteFeedback(id: string) {
		if (!confirm('Delete this feedback? This cannot be undone.')) return;
		const res = await fetch(`/api/feedback/${id}`, { method: 'DELETE' });
		if (res.ok) {
			feedbackItems = feedbackItems.filter((f) => f.id !== id);
		} else {
			errorMsg = (await res.json().catch(() => ({}))).error || 'Failed to delete';
		}
	}

	// Support ?tab= URL parameter to deep-link to a category
	const urlTab = $page.url.searchParams.get('tab');
	const initialTab: TabType = urlTab === 'naming' ? 'naming' : urlTab === 'primers' ? 'primers' : urlTab === 'protocols' ? 'protocols' : urlTab === 'people' ? 'people' : urlTab === 'feedback' ? 'feedback' : urlTab === 'labels' ? 'labels' : urlTab === 'backup' ? 'backup' : urlTab === 'danger' ? 'danger' : 'category';
	const initialCategory = (urlTab && urlTab in CATEGORY_LABELS) ? urlTab : 'geo_loc_name';

	let tabType = $state<TabType>(initialTab);
	let categories = $state(structuredClone(data.categories) as Record<string, any[]>);
	let activeCategory = $state(initialCategory);
	let activeVocabGroup = $state(vocabGroupFor(initialCategory));
	let activeGroupCategories = $derived(
		VOCAB_GROUPS.find(g => g.label === activeVocabGroup)?.categories ?? []
	);
	let activeGroupDescription = $derived(
		VOCAB_GROUPS.find(g => g.label === activeVocabGroup)?.description ?? ''
	);
	let primerSets = $state(structuredClone(data.primerSets) as any[]);
	let pcrProtocols = $state(structuredClone(data.pcrProtocols) as any[]);

	const matches = (s: unknown, q: string): boolean =>
		typeof s === 'string' && s.toLowerCase().includes(q);

	let filteredCategoryItems = $derived(
		(() => {
			const items = categories[activeCategory] || [];
			if (!searchQuery.trim()) return items;
			const q = searchQuery.toLowerCase();
			return items.filter((i: any) => matches(i.value, q) || matches(i.label, q));
		})()
	);
	let filteredPrimerSets = $derived(
		(() => {
			if (!searchQuery.trim()) return primerSets;
			const q = searchQuery.toLowerCase();
			return primerSets.filter(
				(ps: any) =>
					matches(ps.name, q) ||
					matches(ps.target_gene, q) ||
					matches(ps.target_subfragment, q) ||
					matches(ps.forward_primer_name, q) ||
					matches(ps.reverse_primer_name, q) ||
					matches(ps.reference, q)
			);
		})()
	);
	let filteredPcrProtocols = $derived(
		(() => {
			if (!searchQuery.trim()) return pcrProtocols;
			const q = searchQuery.toLowerCase();
			return pcrProtocols.filter(
				(p: any) => matches(p.name, q) || matches(p.polymerase, q) || matches(p.pcr_cond, q)
			);
		})()
	);

	// --- Naming templates ---
	const NAMING_FIELDS = [
		{ key: 'project_name', label: 'Project Name', hint: 'e.g., {PI}_{Year}_{Region}' },
		{ key: 'site_name', label: 'Site Name', hint: 'e.g., {Location}_{Habitat}_{Number}' },
		{ key: 'sample_name', label: 'Sample Name', hint: 'e.g., {Site}_{Date}_{Number}' },
		{ key: 'extract_name', label: 'Extract Name', hint: 'e.g., {Sample}_EXT{Number}' },
		{ key: 'pcr_plate_name', label: 'PCR Plate Name', hint: 'e.g., {Gene}_{Date}_{PlateNumber}' },
		{ key: 'library_plate_name', label: 'Library Plate Name', hint: 'e.g., {Type}_{Date}_{PlateNumber}' },
		{ key: 'run_name', label: 'Run Name', hint: 'e.g., RUN_{Date}_{Instrument}' },
	];

	let naming = $state<Record<string, string>>({ ...data.naming } as Record<string, string>);
	let namingSaving = $state(false);
	let namingSaved = $state(false);

	async function saveNaming() {
		namingSaving = true; namingSaved = false; clearMsg();
		// Upsert each template
		for (const field of NAMING_FIELDS) {
			const template = naming[field.key] || '';
			// Check if exists
			const existing = (categories['naming_template'] || []).find((v: any) => v.value === field.key);
			if (existing) {
				await fetch(`/api/settings/constrained-values/${existing.id}`, {
					method: 'PUT', headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ ...existing, label: template })
				});
			} else {
				const res = await fetch('/api/settings/constrained-values', {
					method: 'POST', headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ category: 'naming_template', value: field.key, label: template })
				});
				if (res.ok) {
					const created = await res.json();
					if (!categories['naming_template']) categories['naming_template'] = [];
					categories['naming_template'] = [...categories['naming_template'], created];
				}
			}
		}
		namingSaving = false; namingSaved = true;
		setTimeout(() => { namingSaved = false; }, 2000);
	}

	// --- Constrained values CRUD ---
	let newValue = $state('');
	let errorMsg = $state('');
	let editingId = $state('');
	let editValue = $state('');
	let sraRefreshing = $state(false);

	async function refreshSra() {
		sraRefreshing = true;
		try {
			const res = await fetch('/api/settings/sra-vocabulary', { method: 'POST' });
			if (res.ok) {
				// Reload to pick up new vocabulary
				window.location.reload();
			} else {
				errorMsg = 'Failed to refresh SRA vocabulary';
			}
		} catch {
			errorMsg = 'Failed to refresh SRA vocabulary';
		}
		sraRefreshing = false;
	}

	function clearMsg() { errorMsg = ''; }

	async function addValue() {
		if (!newValue.trim()) return;
		clearMsg();
		const res = await fetch('/api/settings/constrained-values', {
			method: 'POST', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ category: activeCategory, value: newValue.trim() })
		});
		if (res.ok) {
			const created = await res.json();
			if (!categories[activeCategory]) categories[activeCategory] = [];
			categories[activeCategory] = [...categories[activeCategory], created];
			newValue = '';
		} else { errorMsg = (await res.json().catch(() => ({}))).error || 'Failed'; }
	}

	async function removeValue(id: string) {
		await fetch(`/api/settings/constrained-values/${id}`, { method: 'DELETE' });
		categories[activeCategory] = categories[activeCategory].filter((v: any) => v.id !== id);
	}

	async function toggleActive(item: any) {
		const res = await fetch(`/api/settings/constrained-values/${item.id}`, {
			method: 'PUT', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...item, is_active: item.is_active ? 0 : 1 })
		});
		if (res.ok) { item.is_active = item.is_active ? 0 : 1; categories[activeCategory] = [...categories[activeCategory]]; }
	}

	function startEdit(item: any) { editingId = item.id; editValue = item.value; }
	async function saveEdit(item: any) {
		if (!editValue.trim()) return;
		const res = await fetch(`/api/settings/constrained-values/${item.id}`, {
			method: 'PUT', headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...item, value: editValue.trim() })
		});
		if (res.ok) { item.value = editValue.trim(); categories[activeCategory] = [...categories[activeCategory]]; editingId = ''; }
	}

	// --- Primer Sets CRUD ---
	const emptyPrimer = () => ({ name: '', target_gene: '16S', target_subfragment: '', forward_primer_name: '', forward_primer_seq: '', reverse_primer_name: '', reverse_primer_seq: '', reference: '' });
	let newPrimer = $state(emptyPrimer());
	let editingPrimerId = $state('');
	let editPrimer = $state(emptyPrimer());

	async function addPrimer() {
		if (!newPrimer.name.trim()) return; clearMsg();
		const res = await fetch('/api/settings/primer-sets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newPrimer) });
		if (res.ok) { primerSets = [...primerSets, await res.json()]; newPrimer = emptyPrimer(); }
		else { errorMsg = (await res.json().catch(() => ({}))).error || 'Failed'; }
	}

	function startEditPrimer(ps: any) {
		editingPrimerId = ps.id;
		editPrimer = { name: ps.name, target_gene: ps.target_gene, target_subfragment: ps.target_subfragment || '', forward_primer_name: ps.forward_primer_name || '', forward_primer_seq: ps.forward_primer_seq || '', reverse_primer_name: ps.reverse_primer_name || '', reverse_primer_seq: ps.reverse_primer_seq || '', reference: ps.reference || '' };
	}

	async function saveEditPrimer() {
		if (!editPrimer.name.trim()) return; clearMsg();
		const res = await fetch(`/api/settings/primer-sets/${editingPrimerId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editPrimer) });
		if (res.ok) { const updated = await res.json(); primerSets = primerSets.map(p => p.id === editingPrimerId ? updated : p); editingPrimerId = ''; }
		else { errorMsg = (await res.json().catch(() => ({}))).error || 'Failed'; }
	}

	async function duplicatePrimer(ps: any) {
		clearMsg();
		const body = { ...ps, name: `${ps.name} (copy)`, id: undefined, created_at: undefined };
		const res = await fetch('/api/settings/primer-sets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (res.ok) { primerSets = [...primerSets, await res.json()]; }
		else { errorMsg = (await res.json().catch(() => ({}))).error || 'Failed'; }
	}

	async function removePrimer(id: string) {
		await fetch(`/api/settings/primer-sets/${id}`, { method: 'DELETE' });
		primerSets = primerSets.filter(p => p.id !== id);
	}

	// --- PCR Protocols CRUD ---
	const emptyProtocol = () => ({ name: '', polymerase: '', annealing_temp_c: '' as string | number, num_cycles: '' as string | number, pcr_cond: '' });
	let newProtocol = $state(emptyProtocol());
	let editingProtocolId = $state('');
	let editProtocol = $state(emptyProtocol());

	async function addProtocol() {
		if (!newProtocol.name.trim()) return; clearMsg();
		const body = { ...newProtocol, annealing_temp_c: newProtocol.annealing_temp_c ? +newProtocol.annealing_temp_c : null, num_cycles: newProtocol.num_cycles ? +newProtocol.num_cycles : null };
		const res = await fetch('/api/settings/pcr-protocols', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (res.ok) { pcrProtocols = [...pcrProtocols, await res.json()]; newProtocol = emptyProtocol(); }
		else { errorMsg = (await res.json().catch(() => ({}))).error || 'Failed'; }
	}

	function startEditProtocol(proto: any) {
		editingProtocolId = proto.id;
		editProtocol = { name: proto.name, polymerase: proto.polymerase || '', annealing_temp_c: proto.annealing_temp_c ?? '', num_cycles: proto.num_cycles ?? '', pcr_cond: proto.pcr_cond || '' };
	}

	async function saveEditProtocol() {
		if (!editProtocol.name.trim()) return; clearMsg();
		const body = { ...editProtocol, annealing_temp_c: editProtocol.annealing_temp_c ? +editProtocol.annealing_temp_c : null, num_cycles: editProtocol.num_cycles ? +editProtocol.num_cycles : null };
		const res = await fetch(`/api/settings/pcr-protocols/${editingProtocolId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (res.ok) { const updated = await res.json(); pcrProtocols = pcrProtocols.map(p => p.id === editingProtocolId ? updated : p); editingProtocolId = ''; }
		else { errorMsg = (await res.json().catch(() => ({}))).error || 'Failed'; }
	}

	async function duplicateProtocol(proto: any) {
		clearMsg();
		const body = { ...proto, name: `${proto.name} (copy)`, id: undefined, created_at: undefined };
		const res = await fetch('/api/settings/pcr-protocols', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
		if (res.ok) { pcrProtocols = [...pcrProtocols, await res.json()]; }
		else { errorMsg = (await res.json().catch(() => ({}))).error || 'Failed'; }
	}

	async function removeProtocol(id: string) {
		await fetch(`/api/settings/pcr-protocols/${id}`, { method: 'DELETE' });
		pcrProtocols = pcrProtocols.filter(p => p.id !== id);
	}

	const inputCls = 'px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';
	const selectCls = 'px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500';
</script>

<div class="max-w-5xl space-y-6">
	<div>
		<h1 class="text-2xl font-bold text-white">Manage</h1>
		<p class="text-slate-400 mt-1 text-sm">Picklists, primer sets, PCR protocols, people — plus links to bulk tools below.</p>
	</div>

	<!-- Tools row: links out to the heavyweight pages that used to live in
	     the top nav. Keeps them one click away from Manage without bloating
	     the nav bar. -->
	<div class="flex flex-wrap gap-2">
		<a
			href="/export"
			class="px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-sm text-slate-200 transition-colors flex items-center gap-2"
		>
			<svg class="w-4 h-4 text-ocean-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
				<path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" />
			</svg>
			Import / Export
		</a>
		<a
			href="/glossary"
			class="px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-sm text-slate-200 transition-colors flex items-center gap-2"
		>
			<svg class="w-4 h-4 text-ocean-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
				<path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
			</svg>
			MIxS Glossary
		</a>
		<a
			href="https://sampletown-org.github.io/eDNA-SampleTown/"
			target="_blank"
			rel="noopener noreferrer"
			class="px-3 py-2 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-sm text-slate-200 transition-colors flex items-center gap-2"
		>
			<svg class="w-4 h-4 text-ocean-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
				<circle cx="12" cy="12" r="10" />
				<path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
				<line x1="12" y1="17" x2="12.01" y2="17" />
			</svg>
			Help &amp; Docs
		</a>
	</div>

	{#if errorMsg}<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>{/if}

	<!-- Top-level tabs -->
	<div class="flex flex-wrap gap-1 p-1 bg-slate-800 rounded-lg w-fit max-w-full">
		<button onclick={() => { tabType = 'naming'; resetSearch(); }} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {tabType === 'naming' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">Naming</button>
		<button onclick={() => { tabType = 'category'; resetSearch(); }} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {tabType === 'category' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">Picklists</button>
		<button onclick={() => { tabType = 'primers'; resetSearch(); }} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {tabType === 'primers' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">Primer Sets</button>
		<button onclick={() => { tabType = 'protocols'; resetSearch(); }} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {tabType === 'protocols' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">PCR Protocols</button>
		<button onclick={() => { tabType = 'people'; resetSearch(); }} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {tabType === 'people' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">People</button>
		<button onclick={() => { tabType = 'labels'; resetSearch(); }} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {tabType === 'labels' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">Labels</button>
		{#if data.isAdmin}
			<button onclick={() => { tabType = 'backup'; resetSearch(); loadBackupData(); }} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {tabType === 'backup' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">Backup</button>
			<button onclick={() => { tabType = 'danger'; resetSearch(); }} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {tabType === 'danger' ? 'bg-red-700 text-white' : 'text-red-400 hover:text-red-300'}">Danger</button>
		{/if}
		{#if data.isAdmin}
			<button onclick={() => { tabType = 'feedback'; resetSearch(); }} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {tabType === 'feedback' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">
				Feedback
				{#if feedbackItems.filter(f => f.status === 'open').length > 0}
					<span class="ml-1 px-1.5 py-0.5 bg-red-600 text-white text-xs rounded-full">{feedbackItems.filter(f => f.status === 'open').length}</span>
				{/if}
			</button>
		{/if}
	</div>

	<!-- Search filter — applies to list-based tabs (skipped on Naming + Picklists + Labels, which have their own navigation). -->
	{#if tabType !== 'naming' && tabType !== 'category' && tabType !== 'labels'}
		<div class="flex">
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Filter {tabType === 'primers' ? 'primer sets' : tabType === 'protocols' ? 'protocols' : tabType === 'people' ? 'users + personnel' : tabType === 'feedback' ? 'feedback' : 'entries'}..."
				class="flex-1 max-w-sm px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500 text-sm"
			/>
		</div>
	{/if}

	{#if tabType === 'naming'}
	<div class="space-y-4">
		<p class="text-sm text-slate-400">Set the default name template for each entity. Tokens in <code class="text-ocean-400">{'{'}Braces{'}'}</code> auto-fill from the surrounding context when known; unknown tokens stay literal so you can spot what to fill in.</p>
		<div class="text-xs text-slate-500 p-3 rounded-lg border border-slate-800 bg-slate-900/40">
			<span class="text-slate-400">Available tokens —</span>
			<span class="text-slate-500">Auto from clock:</span>
			<code class="text-ocean-400">{'{'}Date{'}'}</code>
			<code class="text-ocean-400">{'{'}Year{'}'}</code>
			<code class="text-ocean-400">{'{'}Month{'}'}</code>
			<code class="text-ocean-400">{'{'}Day{'}'}</code>
			·
			<span class="text-slate-500">From context (where applicable):</span>
			<code class="text-ocean-400">{'{'}Project{'}'}</code>
			<code class="text-ocean-400">{'{'}Site{'}'}</code>
			<code class="text-ocean-400">{'{'}Sample{'}'}</code>
			<code class="text-ocean-400">{'{'}Extract{'}'}</code>
			<code class="text-ocean-400">{'{'}Source{'}'}</code>
			<code class="text-ocean-400">{'{'}Gene{'}'}</code>
			<code class="text-ocean-400">{'{'}Number{'}'}</code>
			<code class="text-ocean-400">{'{'}Instrument{'}'}</code>
			<code class="text-ocean-400">{'{'}PI{'}'}</code>
			<code class="text-ocean-400">{'{'}Location{'}'}</code>
		</div>
		<div class="space-y-3">
			{#each NAMING_FIELDS as field}
			<div class="flex items-center gap-4">
				<label class="w-40 text-sm font-medium text-slate-300 shrink-0">{field.label}</label>
				<input
					type="text"
					bind:value={naming[field.key]}
					class="flex-1 {inputCls} text-sm"
					placeholder={field.hint}
				/>
			</div>
			{/each}
		</div>
		<div class="flex items-center gap-3 pt-2">
			<button onclick={saveNaming} disabled={namingSaving} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">
				{namingSaving ? 'Saving...' : 'Save Templates'}
			</button>
			{#if namingSaved}<span class="text-sm text-green-400">Saved</span>{/if}
		</div>
	</div>

	{:else if tabType === 'category'}
	<!-- Vocabulary group tabs -->
	<div class="flex flex-wrap gap-1 p-1 bg-slate-800 rounded-lg w-fit max-w-full">
		{#each VOCAB_GROUPS as group}
			<button onclick={() => { activeVocabGroup = group.label; activeCategory = group.categories[0]; clearMsg(); }}
				class="px-4 py-1.5 rounded text-sm font-medium transition-colors {activeVocabGroup === group.label ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">
				{group.label}
			</button>
		{/each}
	</div>
	<p class="text-xs text-slate-500 -mt-3">{activeGroupDescription}</p>

	<!-- Category pills within active group -->
	<div class="flex flex-wrap gap-1 p-1 bg-slate-800/50 rounded-lg">
		{#each activeGroupCategories as cat}
			<button onclick={() => { activeCategory = cat; clearMsg(); }}
				class="px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap {activeCategory === cat ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">
				{CATEGORY_LABELS[cat]}
			</button>
		{/each}
	</div>

	{#if activeVocabGroup === 'SRA / ENA'}
	<div class="p-3 rounded-lg border border-slate-800 bg-slate-900/50 flex items-center justify-between text-xs text-slate-400">
		<span>
			SRA controlled vocabulary &middot;
			{sraVocab?.strategies?.length ?? 0} strategies,
			{sraVocab?.sources?.length ?? 0} sources,
			{sraVocab?.selections?.length ?? 0} selections,
			{Object.keys(sraVocab?.platforms ?? {}).length} platforms
			{#if sraVocab?.fetchedAt}
				&middot; fetched {new Date(sraVocab.fetchedAt).toLocaleDateString()}
			{/if}
		</span>
		<div class="flex gap-2">
			<a href="/api/settings/sra-vocabulary/download" class="text-ocean-400 hover:text-ocean-300">Download xlsx</a>
			<button onclick={refreshSra} disabled={sraRefreshing} class="text-ocean-400 hover:text-ocean-300 disabled:opacity-50">
				{sraRefreshing ? 'Refreshing...' : 'Refresh from NCBI'}
			</button>
		</div>
	</div>
	{/if}

	<div class="space-y-2">
		<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">{CATEGORY_LABELS[activeCategory]}</h2>
		<div class="space-y-1 max-h-96 overflow-y-auto">
			{#each filteredCategoryItems as item}
			{@const sraStatus = isSraValid(activeCategory, item.value)}
			<div class="flex items-center gap-2 p-2 rounded-lg {item.is_active ? 'bg-slate-800/50' : 'bg-slate-900/50 opacity-50'}">
				{#if editingId === item.id}
					<input type="text" bind:value={editValue} class="flex-1 {inputCls} text-sm" onkeydown={(e) => { if (e.key === 'Enter') saveEdit(item); if (e.key === 'Escape') { editingId = ''; } }} />
					<button onclick={() => saveEdit(item)} class="text-xs text-green-400 hover:text-green-300">Save</button>
					<button onclick={() => { editingId = ''; }} class="text-xs text-slate-500 hover:text-slate-300">Cancel</button>
				{:else}
					{#if sraStatus === true}
						<span class="w-2 h-2 rounded-full bg-green-500 shrink-0" title="Valid SRA term"></span>
					{:else if sraStatus === false}
						<span class="w-2 h-2 rounded-full bg-yellow-500 shrink-0" title="Custom (not in SRA vocabulary)"></span>
					{/if}
					<span class="flex-1 text-sm text-white">{item.value}</span>
					<button onclick={() => startEdit(item)} class="text-xs text-slate-500 hover:text-ocean-400">Edit</button>
					<button onclick={() => toggleActive(item)} class="text-xs {item.is_active ? 'text-slate-500 hover:text-yellow-400' : 'text-yellow-600 hover:text-green-400'}">
						{item.is_active ? 'Disable' : 'Enable'}
					</button>
					<button onclick={() => removeValue(item.id)} class="text-xs text-slate-600 hover:text-red-400">Del</button>
				{/if}
			</div>
			{/each}
		</div>
		<form onsubmit={(e) => { e.preventDefault(); addValue(); }} class="flex gap-2 pt-2">
			<input type="text" bind:value={newValue} class="flex-1 {inputCls} text-sm" placeholder="Add new value..." />
			<button type="submit" disabled={!newValue.trim()} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">Add</button>
		</form>
	</div>

	{:else if tabType === 'primers'}
	<!-- Primer Sets -->
	<div class="space-y-3">
		<div class="overflow-x-auto">
			<table class="w-full text-sm">
				<thead>
					<tr class="text-xs text-slate-400 uppercase tracking-wider border-b border-slate-700">
						<th class="text-left pb-2 pr-2 font-medium">Name</th>
						<th class="text-left pb-2 pr-2 font-medium">Gene</th>
						<th class="text-left pb-2 pr-2 font-medium">Region</th>
						<th class="text-left pb-2 pr-2 font-medium">Fwd</th>
						<th class="text-left pb-2 pr-2 font-medium">Fwd Seq</th>
						<th class="text-left pb-2 pr-2 font-medium">Rev</th>
						<th class="text-left pb-2 pr-2 font-medium">Rev Seq</th>
						<th class="text-left pb-2 pr-2 font-medium">Ref</th>
						<th class="pb-2"></th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-800">
					{#each filteredPrimerSets as ps}
					<tr class={ps.is_active ? '' : 'opacity-40'}>
						<td class="py-2 pr-2 text-white font-medium">{ps.name}</td>
						<td class="py-2 pr-2 text-slate-300">{ps.target_gene}</td>
						<td class="py-2 pr-2 text-slate-300">{ps.target_subfragment || '--'}</td>
						<td class="py-2 pr-2 text-slate-300">{ps.forward_primer_name}</td>
						<td class="py-2 pr-2 text-slate-400 font-mono text-xs">{ps.forward_primer_seq}</td>
						<td class="py-2 pr-2 text-slate-300">{ps.reverse_primer_name}</td>
						<td class="py-2 pr-2 text-slate-400 font-mono text-xs">{ps.reverse_primer_seq}</td>
						<td class="py-2 pr-2 text-slate-500 text-xs">{ps.reference || ''}</td>
						<td class="py-2 whitespace-nowrap">
							<button onclick={() => startEditPrimer(ps)} class="text-xs text-slate-500 hover:text-ocean-400">Edit</button>
							<button onclick={() => duplicatePrimer(ps)} class="text-xs text-slate-500 hover:text-ocean-400 ml-1">Dup</button>
							<button onclick={() => removePrimer(ps.id)} class="text-xs text-slate-600 hover:text-red-400 ml-1">Del</button>
						</td>
					</tr>
					{/each}
				</tbody>
			</table>
		</div>

		{#if editingPrimerId}
		<form onsubmit={(e) => { e.preventDefault(); saveEditPrimer(); }} class="space-y-3 p-4 bg-slate-800/30 rounded-lg border border-ocean-700">
			<p class="text-sm font-medium text-ocean-400">Editing primer set</p>
			<div class="grid grid-cols-3 gap-3">
				<div><label class="block text-xs text-slate-400 mb-1">Name</label><input type="text" bind:value={editPrimer.name} class="w-full {inputCls} text-sm" /></div>
				<div><label class="block text-xs text-slate-400 mb-1">Target Gene</label>
					<select bind:value={editPrimer.target_gene} class="w-full {selectCls} text-sm"><option>16S</option><option>18S</option><option>CO1</option><option>12S</option><option>ITS</option><option>other</option></select></div>
				<div><label class="block text-xs text-slate-400 mb-1">Region</label><input type="text" bind:value={editPrimer.target_subfragment} class="w-full {inputCls} text-sm" /></div>
			</div>
			<div class="grid grid-cols-2 gap-3">
				<div><label class="block text-xs text-slate-400 mb-1">Forward Name</label><input type="text" bind:value={editPrimer.forward_primer_name} class="w-full {inputCls} text-sm" /></div>
				<div><label class="block text-xs text-slate-400 mb-1">Forward Sequence</label><input type="text" bind:value={editPrimer.forward_primer_seq} class="w-full {inputCls} text-sm font-mono" /></div>
				<div><label class="block text-xs text-slate-400 mb-1">Reverse Name</label><input type="text" bind:value={editPrimer.reverse_primer_name} class="w-full {inputCls} text-sm" /></div>
				<div><label class="block text-xs text-slate-400 mb-1">Reverse Sequence</label><input type="text" bind:value={editPrimer.reverse_primer_seq} class="w-full {inputCls} text-sm font-mono" /></div>
			</div>
			<div><label class="block text-xs text-slate-400 mb-1">Reference</label><input type="text" bind:value={editPrimer.reference} class="w-full {inputCls} text-sm" /></div>
			<div class="flex gap-2">
				<button type="submit" class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 text-sm font-medium">Save</button>
				<button type="button" onclick={() => { editingPrimerId = ''; }} class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 text-sm font-medium">Cancel</button>
			</div>
		</form>
		{:else}
		<details class="group">
			<summary class="text-sm font-medium text-ocean-400 cursor-pointer hover:text-ocean-300">Add primer set</summary>
			<form onsubmit={(e) => { e.preventDefault(); addPrimer(); }} class="space-y-3 mt-3 p-4 bg-slate-800/30 rounded-lg">
				<div class="grid grid-cols-3 gap-3">
					<div><label class="block text-xs text-slate-400 mb-1">Name</label><input type="text" bind:value={newPrimer.name} class="w-full {inputCls} text-sm" placeholder="e.g., 16S V4 (515F/806R)" /></div>
					<div><label class="block text-xs text-slate-400 mb-1">Target Gene</label>
						<select bind:value={newPrimer.target_gene} class="w-full {selectCls} text-sm"><option>16S</option><option>18S</option><option>CO1</option><option>12S</option><option>ITS</option><option>other</option></select></div>
					<div><label class="block text-xs text-slate-400 mb-1">Region</label><input type="text" bind:value={newPrimer.target_subfragment} class="w-full {inputCls} text-sm" placeholder="e.g., V4" /></div>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<div><label class="block text-xs text-slate-400 mb-1">Forward Name</label><input type="text" bind:value={newPrimer.forward_primer_name} class="w-full {inputCls} text-sm" /></div>
					<div><label class="block text-xs text-slate-400 mb-1">Forward Sequence</label><input type="text" bind:value={newPrimer.forward_primer_seq} class="w-full {inputCls} text-sm font-mono" /></div>
					<div><label class="block text-xs text-slate-400 mb-1">Reverse Name</label><input type="text" bind:value={newPrimer.reverse_primer_name} class="w-full {inputCls} text-sm" /></div>
					<div><label class="block text-xs text-slate-400 mb-1">Reverse Sequence</label><input type="text" bind:value={newPrimer.reverse_primer_seq} class="w-full {inputCls} text-sm font-mono" /></div>
				</div>
				<div><label class="block text-xs text-slate-400 mb-1">Reference</label><input type="text" bind:value={newPrimer.reference} class="w-full {inputCls} text-sm" placeholder="e.g., Apprill et al. 2015" /></div>
				<button type="submit" disabled={!newPrimer.name.trim()} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 text-sm font-medium">Add Primer Set</button>
			</form>
		</details>
		{/if}
	</div>

	{:else if tabType === 'protocols'}
	<!-- PCR Protocols -->
	<div class="space-y-3">
		<div class="space-y-2">
			{#each filteredPcrProtocols as proto}
			<div class="p-3 rounded-lg bg-slate-800/50 {proto.is_active ? '' : 'opacity-40'}">
				<div class="flex items-center justify-between">
					<span class="text-white font-medium">{proto.name}</span>
					<div class="flex gap-2">
						<button onclick={() => startEditProtocol(proto)} class="text-xs text-slate-500 hover:text-ocean-400">Edit</button>
						<button onclick={() => duplicateProtocol(proto)} class="text-xs text-slate-500 hover:text-ocean-400">Dup</button>
						<button onclick={() => removeProtocol(proto.id)} class="text-xs text-slate-600 hover:text-red-400">Del</button>
					</div>
				</div>
				<div class="flex gap-4 mt-1 text-xs text-slate-400">
					{#if proto.polymerase}<span>Polymerase: <span class="text-slate-300">{proto.polymerase}</span></span>{/if}
					{#if proto.annealing_temp_c}<span>Anneal: <span class="text-slate-300">{proto.annealing_temp_c}°C</span></span>{/if}
					{#if proto.num_cycles}<span>Cycles: <span class="text-slate-300">{proto.num_cycles}</span></span>{/if}
				</div>
				{#if proto.pcr_cond}<p class="text-xs text-slate-500 mt-1 font-mono">{proto.pcr_cond}</p>{/if}
			</div>
			{/each}
		</div>

		{#if editingProtocolId}
		<form onsubmit={(e) => { e.preventDefault(); saveEditProtocol(); }} class="space-y-3 p-4 bg-slate-800/30 rounded-lg border border-ocean-700">
			<p class="text-sm font-medium text-ocean-400">Editing protocol</p>
			<div class="grid grid-cols-2 gap-3">
				<div><label class="block text-xs text-slate-400 mb-1">Name</label><input type="text" bind:value={editProtocol.name} class="w-full {inputCls} text-sm" /></div>
				<div><label class="block text-xs text-slate-400 mb-1">Polymerase</label><input type="text" bind:value={editProtocol.polymerase} class="w-full {inputCls} text-sm" /></div>
			</div>
			<div class="grid grid-cols-3 gap-3">
				<div><label class="block text-xs text-slate-400 mb-1">Anneal °C</label><input type="number" step="any" bind:value={editProtocol.annealing_temp_c} class="w-full {inputCls} text-sm" /></div>
				<div><label class="block text-xs text-slate-400 mb-1">Cycles</label><input type="number" bind:value={editProtocol.num_cycles} class="w-full {inputCls} text-sm" /></div>
				<div><label class="block text-xs text-slate-400 mb-1">PCR Conditions</label><input type="text" bind:value={editProtocol.pcr_cond} class="w-full {inputCls} text-sm" /></div>
			</div>
			<div class="flex gap-2">
				<button type="submit" class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 text-sm font-medium">Save</button>
				<button type="button" onclick={() => { editingProtocolId = ''; }} class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 text-sm font-medium">Cancel</button>
			</div>
		</form>
		{:else}
		<details class="group">
			<summary class="text-sm font-medium text-ocean-400 cursor-pointer hover:text-ocean-300">Add protocol</summary>
			<form onsubmit={(e) => { e.preventDefault(); addProtocol(); }} class="space-y-3 mt-3 p-4 bg-slate-800/30 rounded-lg">
				<div class="grid grid-cols-2 gap-3">
					<div><label class="block text-xs text-slate-400 mb-1">Name</label><input type="text" bind:value={newProtocol.name} class="w-full {inputCls} text-sm" placeholder="e.g., Standard 16S (55°C, 30 cycles)" /></div>
					<div><label class="block text-xs text-slate-400 mb-1">Polymerase</label><input type="text" bind:value={newProtocol.polymerase} class="w-full {inputCls} text-sm" /></div>
				</div>
				<div class="grid grid-cols-3 gap-3">
					<div><label class="block text-xs text-slate-400 mb-1">Anneal °C</label><input type="number" step="any" bind:value={newProtocol.annealing_temp_c} class="w-full {inputCls} text-sm" /></div>
					<div><label class="block text-xs text-slate-400 mb-1">Cycles</label><input type="number" bind:value={newProtocol.num_cycles} class="w-full {inputCls} text-sm" /></div>
					<div><label class="block text-xs text-slate-400 mb-1">PCR Conditions</label><input type="text" bind:value={newProtocol.pcr_cond} class="w-full {inputCls} text-sm" placeholder="e.g., 98°C 30s; 30x(...)" /></div>
				</div>
				<button type="submit" disabled={!newProtocol.name.trim()} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 text-sm font-medium">Add Protocol</button>
			</form>
		</details>
		{/if}
	</div>

	{:else if tabType === 'people'}
	<div class="space-y-8">
		<!-- ============ User accounts (admin only) ============ -->
		{#if data.isAdmin}
		<div class="space-y-3">
			<div>
				<h2 class="text-base font-semibold text-white">User Accounts</h2>
				<p class="text-sm text-slate-400 mt-0.5">
					Who can sign in. New GitHub sign-ins land in <span class="text-amber-400">Pending</span>
					and need approval before they can access the database.
				</p>
			</div>

			<div class="space-y-2">
				{#each filteredUsers as u (u.id)}
					<div class="p-3 rounded-lg bg-slate-800/50 border {u.is_approved ? 'border-slate-800' : 'border-amber-700'}">
						<div class="flex items-start justify-between gap-3">
							<div class="flex items-center gap-3 flex-1">
								{#if u.avatar_emoji}
									<div class="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-lg leading-none">{u.avatar_emoji}</div>
								{:else if u.avatar_url}
									<img src={u.avatar_url} alt="" class="w-8 h-8 rounded-full" />
								{:else}
									<div class="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm text-slate-400">
										{u.username.charAt(0).toUpperCase()}
									</div>
								{/if}
								<div class="flex-1">
									<div class="flex items-center gap-2">
										<span class="text-white font-medium text-sm">{u.username}</span>
										{#if !u.is_approved}
											<span class="text-xs px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400">Pending</span>
										{/if}
										{#if u.must_change_password}
											<span class="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">Temp password</span>
										{/if}
										{#if u.is_local_account}
											<span class="text-xs text-slate-500">local</span>
										{:else if u.github_id}
											<span class="text-xs text-ocean-400">GitHub</span>
										{/if}
									</div>
									<div class="flex gap-3 text-xs text-slate-500 mt-0.5">
										{#if u.display_name}<span>{u.display_name}</span>{/if}
										{#if u.email}<span>{u.email}</span>{/if}
										<span class="font-mono">{u.id.slice(0, 8)}</span>
									</div>
								</div>
							</div>
							<div class="flex items-center gap-2 shrink-0">
								<select
									value={u.role}
									onchange={(e) => changeUserRole(u, (e.currentTarget as HTMLSelectElement).value)}
									class="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-xs focus:outline-none focus:border-ocean-500"
								>
									{#each USER_ROLES as r}<option value={r}>{r}</option>{/each}
								</select>
								{#if !u.is_approved}
									<button onclick={() => approveUser(u)} class="text-xs text-green-400 hover:text-green-300">Approve</button>
								{/if}
								<button onclick={() => startResetPwd(u)} class="text-xs text-slate-500 hover:text-ocean-400">Reset pwd</button>
								<button onclick={() => deleteUser(u)} class="text-xs text-slate-600 hover:text-red-400">Del</button>
							</div>
						</div>
						{#if resetPwdId === u.id}
							<form
								onsubmit={(e) => { e.preventDefault(); submitResetPwd(); }}
								class="mt-3 flex gap-2 items-end"
							>
								<div class="flex-1">
									<label class="block text-xs text-slate-400 mb-1">New temporary password (min 10 chars)</label>
									<input type="text" bind:value={resetPwdValue} minlength="10" class="w-full {inputCls} text-sm" placeholder="The user will be forced to change this on next login" />
								</div>
								<button type="submit" class="px-3 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 text-sm font-medium">Set</button>
								<button type="button" onclick={() => { resetPwdId = ''; }} class="px-3 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 text-sm font-medium">Cancel</button>
							</form>
						{/if}
					</div>
				{/each}
			</div>

			<details class="group">
				<summary class="text-sm font-medium text-ocean-400 cursor-pointer hover:text-ocean-300">Add local user</summary>
				<form onsubmit={(e) => { e.preventDefault(); addUser(); }} class="space-y-3 mt-3 p-4 bg-slate-800/30 rounded-lg">
					<div class="grid grid-cols-2 gap-3">
						<div><label class="block text-xs text-slate-400 mb-1">Username</label><input type="text" bind:value={newUser.username} class="w-full {inputCls} text-sm" required /></div>
						<div><label class="block text-xs text-slate-400 mb-1">Role</label>
							<select bind:value={newUser.role} class="w-full {selectCls} text-sm">
								{#each USER_ROLES as r}<option value={r}>{r}</option>{/each}
							</select></div>
						<div><label class="block text-xs text-slate-400 mb-1">Display name (optional)</label><input type="text" bind:value={newUser.display_name} class="w-full {inputCls} text-sm" /></div>
						<div><label class="block text-xs text-slate-400 mb-1">Email (optional)</label><input type="email" bind:value={newUser.email} class="w-full {inputCls} text-sm" /></div>
						<div class="col-span-2"><label class="block text-xs text-slate-400 mb-1">Temporary password (min 10 chars)</label><input type="text" bind:value={newUser.password} minlength="10" class="w-full {inputCls} text-sm" placeholder="The user will be forced to change this on first login" required /></div>
					</div>
					<button type="submit" class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 text-sm font-medium">Add User</button>
				</form>
			</details>
		</div>
		{/if}

		<!-- ============ Lab invites (admin only) ============ -->
		{#if data.isAdmin}
		<div class="space-y-3">
			<div>
				<h2 class="text-base font-semibold text-white">Lab Invites</h2>
				<p class="text-sm text-slate-400 mt-0.5">
					Generate a single-use invite link for a teammate. They sign in
					with GitHub at the link and land directly in this lab with the
					role you pick.
				</p>
			</div>

			<form onsubmit={(e) => { e.preventDefault(); createInvite(); }}
				class="flex flex-wrap gap-2 items-end p-3 bg-slate-800/30 rounded-lg">
				<div>
					<label for="inv-role" class="block text-xs text-slate-400 mb-1">Role</label>
					<select id="inv-role" bind:value={newInvite.role} class="{selectCls} text-sm">
						<option value="user">user</option>
						<option value="viewer">viewer</option>
						<option value="admin">admin</option>
					</select>
				</div>
				<div class="flex-1 min-w-[200px]">
					<label for="inv-email" class="block text-xs text-slate-400 mb-1">Email hint <span class="text-slate-600">(optional)</span></label>
					<input id="inv-email" type="text" bind:value={newInvite.email_hint}
						class="w-full {inputCls} text-sm" placeholder="who's this for? shown on the join page" />
				</div>
				<div>
					<label for="inv-ttl" class="block text-xs text-slate-400 mb-1">Expires in (days)</label>
					<input id="inv-ttl" type="number" min="1" max="90" bind:value={newInvite.ttl_days} class="w-24 {inputCls} text-sm" />
				</div>
				<button type="submit" class="px-3 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 text-sm font-medium">Create invite</button>
			</form>

			{#if inviteList.length === 0}
				<p class="text-sm text-slate-500 italic">No invites yet. Create one above to onboard a teammate.</p>
			{:else}
				<div class="space-y-2">
					{#each inviteList as inv (inv.token)}
						{@const s = inviteStatus(inv)}
						<div class="p-3 rounded-lg bg-slate-800/50 border border-slate-800">
							<div class="flex items-start justify-between gap-3">
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2 flex-wrap">
										<span class="text-xs font-mono px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">{inv.role}</span>
										<span class="text-xs {s.cls}">{s.label}</span>
										{#if inv.email_hint}<span class="text-xs text-slate-400">{inv.email_hint}</span>{/if}
									</div>
									<div class="flex gap-3 text-xs text-slate-500 mt-1 flex-wrap">
										{#if inv.created_by_username}<span>by @{inv.created_by_username}</span>{/if}
										<span>created {new Date(inv.created_at).toLocaleDateString()}</span>
										<span>expires {new Date(inv.expires_at).toLocaleDateString()}</span>
										<span class="font-mono truncate">{inv.token.slice(0, 12)}…</span>
									</div>
								</div>
								<div class="flex items-center gap-2 shrink-0">
									{#if !inv.used_at}
										<button type="button" onclick={() => copyInvite(inv.token)}
											class="text-xs text-ocean-400 hover:text-ocean-300">
											{inviteCopiedToken === inv.token ? 'Copied!' : 'Copy link'}
										</button>
										<button type="button" onclick={() => revokeInvite(inv.token)}
											class="text-xs text-slate-600 hover:text-red-400">Revoke</button>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
		{/if}

		<!-- ============ Personnel directory ============ -->
		<div class="space-y-3">
			<div>
				<h2 class="text-base font-semibold text-white">Personnel Directory</h2>
				<p class="text-sm text-slate-400 mt-0.5">
					Lab members + collaborators used as the &quot;who did the work&quot; attribution
					on samples, extracts, PCRs, etc. Optionally linked to a User Account.
				</p>
			</div>

		<div class="space-y-2">
			{#each filteredPersonnel as person}
			<div class="p-3 rounded-lg bg-slate-800/50 {person.is_active ? '' : 'opacity-50'}">
				<div class="flex items-start justify-between gap-3">
					<div class="flex items-center gap-3">
						{#if person.avatar_emoji}
							<div class="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-lg leading-none">{person.avatar_emoji}</div>
						{:else if person.avatar_url}
							<img src={person.avatar_url} alt="" class="w-8 h-8 rounded-full" />
						{:else}
							<div class="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-sm text-slate-400">{person.full_name.charAt(0)}</div>
						{/if}
						<div>
							<div class="text-white font-medium text-sm">{person.full_name}</div>
							<div class="flex gap-3 text-xs text-slate-500">
								{#if person.role}<span>{person.role}</span>{/if}
								{#if person.institution}<span>{person.institution}</span>{/if}
								{#if person.github_username}<span class="text-ocean-400">@{person.github_username}</span>{/if}
								{#if person.email}<span>{person.email}</span>{/if}
								{#if person.orcid}<span>{person.orcid}</span>{/if}
							</div>
						</div>
					</div>
					<div class="flex gap-2 shrink-0">
						<button onclick={() => startEditPerson(person)} class="text-xs text-slate-500 hover:text-ocean-400">{editingPersonId === person.id ? 'Close' : 'Edit'}</button>
						<button onclick={() => removePerson(person.id)} class="text-xs text-slate-600 hover:text-red-400">Del</button>
					</div>
				</div>
			</div>
			{#if editingPersonId === person.id}
			<form onsubmit={(e) => { e.preventDefault(); saveEditPerson(); }} class="space-y-3 p-4 bg-slate-800/30 rounded-lg border border-ocean-700 -mt-1">
				<p class="text-sm font-medium text-ocean-400">Editing {person.full_name}</p>
				<div class="grid grid-cols-2 gap-3">
					<div><label class="block text-xs text-slate-400 mb-1">Full Name</label><input type="text" bind:value={editPerson.full_name} class="w-full {inputCls} text-sm" /></div>
					<div><label class="block text-xs text-slate-400 mb-1">Role</label>
						<select bind:value={editPerson.role} class="w-full {selectCls} text-sm">
							<option value="">Select...</option>
							{#each personRoleOptions as r}<option>{r}</option>{/each}
						</select></div>
					<div><label class="block text-xs text-slate-400 mb-1">Email</label><input type="email" bind:value={editPerson.email} class="w-full {inputCls} text-sm" /></div>
					<div><label class="block text-xs text-slate-400 mb-1">Institution</label><input type="text" bind:value={editPerson.institution} class="w-full {inputCls} text-sm" /></div>
					<div><label class="block text-xs text-slate-400 mb-1">ORCID</label><input type="text" bind:value={editPerson.orcid} class="w-full {inputCls} text-sm" placeholder="0000-0000-0000-0000" /></div>
					<div><label class="block text-xs text-slate-400 mb-1">GitHub Account</label>
						<select bind:value={editPerson.user_id} class="w-full {selectCls} text-sm">
							<option value="">Not linked</option>
							{#each data.users as u}<option value={u.id}>@{u.username} ({u.display_name || u.email || ''})</option>{/each}
						</select></div>
				</div>
				<div class="flex gap-2">
					<button type="submit" class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 text-sm font-medium">Save</button>
					<button type="button" onclick={() => { editingPersonId = ''; }} class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 text-sm font-medium">Cancel</button>
				</div>
			</form>
			{/if}
			{/each}
		</div>


		<details class="group">
			<summary class="text-sm font-medium text-ocean-400 cursor-pointer hover:text-ocean-300">Add person</summary>
			<form onsubmit={(e) => { e.preventDefault(); addPerson(); }} class="space-y-3 mt-3 p-4 bg-slate-800/30 rounded-lg">
				<div class="grid grid-cols-2 gap-3">
					<div><label class="block text-xs text-slate-400 mb-1">Full Name</label><input type="text" bind:value={newPerson.full_name} class="w-full {inputCls} text-sm" placeholder="e.g., Jane Smith" /></div>
					<div><label class="block text-xs text-slate-400 mb-1">Role</label>
						<select bind:value={newPerson.role} class="w-full {selectCls} text-sm">
							<option value="">Select...</option>
							{#each personRoleOptions as r}<option>{r}</option>{/each}
						</select></div>
					<div><label class="block text-xs text-slate-400 mb-1">Email</label><input type="email" bind:value={newPerson.email} class="w-full {inputCls} text-sm" /></div>
					<div><label class="block text-xs text-slate-400 mb-1">Institution</label><input type="text" bind:value={newPerson.institution} class="w-full {inputCls} text-sm" /></div>
					<div><label class="block text-xs text-slate-400 mb-1">ORCID</label><input type="text" bind:value={newPerson.orcid} class="w-full {inputCls} text-sm" placeholder="0000-0000-0000-0000" /></div>
					<div><label class="block text-xs text-slate-400 mb-1">GitHub Account</label>
						<select bind:value={newPerson.user_id} class="w-full {selectCls} text-sm">
							<option value="">Not linked</option>
							{#each data.users as u}<option value={u.id}>@{u.username} ({u.display_name || u.email || ''})</option>{/each}
						</select></div>
				</div>
				<button type="submit" disabled={!newPerson.full_name.trim()} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 text-sm font-medium">Add Person</button>
			</form>
		</details>
		</div> <!-- /Personnel directory -->
	</div>

	{:else if tabType === 'feedback'}
	<div class="space-y-3">
		<p class="text-sm text-slate-400">User-submitted feedback from across the site.</p>
		{#if feedbackItems.length === 0}
			<p class="text-sm text-slate-500">No feedback yet.</p>
		{:else}
			<div class="space-y-2">
				{#each filteredFeedback as item}
				<div class="p-3 rounded-lg {item.status === 'open' ? 'bg-slate-800/50 border border-slate-700' : 'bg-slate-900/50 border border-slate-800 opacity-60'}">
					<div class="flex items-start justify-between gap-3">
						<div class="flex-1">
							<p class="text-sm text-white">{item.message}</p>
							<div class="flex gap-3 mt-1 text-xs text-slate-500">
								<span>{item.username}</span>
								<span>{item.page_url}</span>
								<span>{new Date(item.created_at).toLocaleDateString()}</span>
								<span class="px-1.5 rounded {item.status === 'open' ? 'bg-yellow-900/50 text-yellow-400' : item.status === 'resolved' ? 'bg-green-900/50 text-green-400' : 'bg-slate-800 text-slate-500'}">{item.status}</span>
							</div>
						</div>
						<div class="flex items-center gap-2 shrink-0">
							{#if item.status === 'open'}
								<button onclick={() => resolveFeedback(item.id, 'resolved')} class="text-xs text-slate-500 hover:text-green-400">Resolve</button>
								<button onclick={() => resolveFeedback(item.id, 'wontfix')} class="text-xs text-slate-500 hover:text-amber-400">Won't fix</button>
							{:else}
								<button onclick={() => resolveFeedback(item.id, 'open')} class="text-xs text-slate-500 hover:text-ocean-400">Reopen</button>
							{/if}
							<button onclick={() => deleteFeedback(item.id)} class="text-xs text-slate-600 hover:text-red-400">Del</button>
						</div>
					</div>
				</div>
				{/each}
			</div>
		{/if}
	</div>

	{:else if tabType === 'labels'}
	<LabelGenerator />

	{:else if tabType === 'backup'}
	<div class="space-y-6">
		<div>
			<h2 class="text-base font-semibold text-white">GitHub Backup</h2>
			<p class="text-sm text-slate-400 mt-0.5">
				Push a JSON snapshot of every project / sample / extract / PCR / library /
				run / analysis row in this lab to a GitHub repo. Use it for off-box
				disaster recovery and version-controlled provenance.
			</p>
			<p class="text-sm text-slate-400 mt-2">
				<strong class="text-amber-300">Not backed up:</strong> photo files,
				user accounts and sessions, lab settings, saved carts,
				and the feedback queue.
			</p>
		</div>

		<form onsubmit={(e) => { e.preventDefault(); saveBackupSettings(); }} class="space-y-4 p-4 rounded-lg bg-slate-800/30">
			<div>
				<label for="bk-repo" class="block text-sm text-slate-300 mb-1">GitHub repo</label>
				<input id="bk-repo" type="text" bind:value={backupForm.github_repo} class="w-full {inputCls} text-sm"
					placeholder="owner/repository-name" />
				<p class="text-xs text-slate-500 mt-1">
					A GitHub repository you own where backups will be written.
					Each backup is one commit containing the latest snapshot of your
					lab's data as JSON files.
				</p>
			</div>
			<div>
				<label for="bk-token" class="block text-sm text-slate-300 mb-1">
					GitHub access token
					{#if backupSettings?.github_token_set}
						<span class="ml-2 text-xs text-green-400">●●●●  (currently set)</span>
					{/if}
				</label>
				<input id="bk-token" type="password" bind:value={backupForm.github_token}
					autocomplete="new-password" class="w-full {inputCls} text-sm"
					placeholder={backupSettings?.github_token_set ? 'leave blank to keep existing token' : 'paste your token here'} />
				<details class="mt-2 text-xs text-slate-500">
					<summary class="cursor-pointer text-ocean-400 hover:text-ocean-300">How to generate a token</summary>
					<div class="mt-2 space-y-3 text-slate-400">
						<div>
							<div class="text-slate-300 font-medium mb-1">For a repo you own personally:</div>
							<ol class="list-decimal pl-5 space-y-1">
								<li>
									Open
									<a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer"
										class="text-ocean-400 hover:text-ocean-300">github.com/settings/personal-access-tokens/new</a>
									(fine-grained tokens)
								</li>
								<li>Token name: anything (e.g. "SampleTown backups")</li>
								<li>Expiration: pick what you're comfortable with — rotation reminder is on you</li>
								<li>Repository access: <strong>Only select repositories</strong> &rarr; pick your backup repo</li>
								<li>
									Repository permissions &rarr; <strong>Contents</strong>: <strong>Read and write</strong>
								</li>
								<li>Generate, copy the <code>github_pat_…</code> value, paste above</li>
							</ol>
						</div>
						<div>
							<div class="text-slate-300 font-medium mb-1">For an org-owned repo:</div>
							<p>
								Fine-grained PATs only work against an organization that has
								explicitly enabled them. If you get a
								<code class="text-amber-400">403 "Resource not accessible by personal access token"</code>
								error, either:
							</p>
							<ul class="list-disc pl-5 space-y-1 mt-1">
								<li>
									Ask the org admin to allow fine-grained tokens (Org Settings &rarr; Personal access tokens &rarr; Allow access),
									then redo the steps above.
								</li>
								<li>
									Or fall back to a <strong>classic</strong> token at
									<a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener noreferrer"
										class="text-ocean-400 hover:text-ocean-300">github.com/settings/tokens/new</a>
									with the <code>repo</code> scope checked.
								</li>
							</ul>
						</div>
					</div>
				</details>
			</div>
			<div>
				<label for="bk-interval" class="block text-sm text-slate-300 mb-1">Auto-backup every (hours)</label>
				<input id="bk-interval" type="number" min="0" max="8760" bind:value={backupForm.backup_interval_hours}
					class="w-32 {inputCls} text-sm" />
				<p class="text-xs text-slate-500 mt-1">
					0 means manual only — backups happen when you click Backup now.
					Otherwise SampleTown pushes an automatic backup every N hours
					(common picks: 24 for daily, 168 for weekly).
				</p>
			</div>
			<div class="flex gap-3 pt-2">
				<button type="submit" disabled={backupBusy}
					class="px-3 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 text-sm font-medium">
					{backupBusy ? 'Saving…' : 'Save settings'}
				</button>
				<button type="button" onclick={runBackupNow} disabled={backupBusy}
					class="px-3 py-2 border border-slate-700 text-slate-200 rounded-lg hover:bg-slate-800 disabled:opacity-50 text-sm font-medium">
					{backupBusy ? 'Working…' : 'Backup now'}
				</button>
				{#if backupSettings?.last_backup_at}
					<span class="text-xs text-slate-500 self-center">
						Last successful: {new Date(backupSettings.last_backup_at).toLocaleString()}
					</span>
				{/if}
			</div>

			<!-- Result of the most recent Save / Backup-now action.
			     Lives BELOW the buttons so it shows up where the eye
			     already is after clicking — beta feedback was that an
			     above-the-form notification looked like a static page
			     header and got missed. -->
			{#if backupMsg}
				<div class="p-3 rounded-lg border text-sm
					{backupMsg.startsWith('Pushed') || backupMsg.startsWith('Saved. Connection') || backupMsg.startsWith('No data changes') || backupMsg === 'Saved.'
						? 'bg-green-900/20 border-green-800 text-green-300'
						: 'bg-amber-900/20 border-amber-800 text-amber-300'}">{backupMsg}</div>
			{/if}
		</form>

		<!-- ====== Restore from a previous snapshot ====== -->
		<div class="space-y-3 p-4 rounded-lg border border-amber-900/40 bg-amber-950/10">
			<div class="flex items-start justify-between gap-3">
				<div>
					<h3 class="text-sm font-semibold text-amber-300">Restore from backup</h3>
					<p class="text-xs text-slate-400 mt-1">
						Replace this lab's data with a previous snapshot from the configured
						GitHub repo. <strong class="text-amber-300">All current data in this lab will be wiped</strong>
						before the snapshot is loaded — backup first if you might want to undo.
					</p>
				</div>
				{#if !restoreOpen}
					<button type="button" onclick={() => { restoreOpen = true; loadRestoreCommits(); }}
						class="px-3 py-1.5 border border-amber-800 text-amber-300 rounded-lg hover:bg-amber-900/30 text-sm font-medium shrink-0">
						Open
					</button>
				{:else}
					<button type="button" onclick={() => { restoreOpen = false; restoreMsg = ''; restoreCommitSha = ''; restoreConfirm = ''; }}
						class="px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 text-sm font-medium shrink-0">
						Close
					</button>
				{/if}
			</div>

			{#if restoreOpen}
				{#if restoreLoading}
					<p class="text-xs text-slate-500 italic">Loading snapshots…</p>
				{:else if restoreCommits.length === 0}
					<p class="text-xs text-slate-500 italic">{restoreMsg || 'No snapshots available.'}</p>
				{:else}
					<form onsubmit={(e) => { e.preventDefault(); runRestore(); }} class="space-y-3">
						<div>
							<label for="rs-commit" class="block text-xs text-slate-300 mb-1">Pick a snapshot</label>
							<select id="rs-commit" bind:value={restoreCommitSha} class="w-full {selectCls} text-sm font-mono">
								<option value="">— select a commit —</option>
								{#each restoreCommits as c (c.sha)}
									<option value={c.sha}>
										{c.sha.slice(0, 7)} · {c.date ? new Date(c.date).toLocaleString() : ''} · {c.message.split('\n')[0].slice(0, 60)}
									</option>
								{/each}
							</select>
						</div>
						<div>
							<label for="rs-confirm" class="block text-xs text-slate-300 mb-1">
								Type the lab name <code class="text-amber-300">{data.lab?.name ?? ''}</code> to confirm wipe-and-restore:
							</label>
							<input id="rs-confirm" type="text" bind:value={restoreConfirm}
								autocomplete="off" class="w-full {inputCls} text-sm" />
						</div>
						{#if restoreMsg}
							<div class="p-2 rounded-lg border text-xs
								{restoreMsg.startsWith('Restored')
									? 'bg-green-900/20 border-green-800 text-green-300'
									: 'bg-amber-900/20 border-amber-800 text-amber-300'}">{restoreMsg}</div>
						{/if}
						<button type="submit"
							disabled={restoreBusy || !restoreCommitSha || restoreConfirm !== (data.lab?.name ?? '__no__')}
							class="px-3 py-2 bg-amber-700 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 text-sm font-medium">
							{restoreBusy ? 'Restoring…' : 'Wipe and restore from this snapshot'}
						</button>
					</form>
				{/if}
			{/if}
		</div>

		<div>
			<h3 class="text-sm font-semibold text-white mb-2">Recent snapshots</h3>
			{#if backupHistory.length === 0}
				<p class="text-sm text-slate-500 italic">No snapshots yet. Click <strong>Backup now</strong> to push one.</p>
			{:else}
				<div class="space-y-2">
					{#each backupHistory as s (s.id)}
						<div class="p-3 rounded-lg border border-slate-800 bg-slate-900/40 text-sm">
							<div class="flex items-start justify-between gap-3">
								<div class="flex-1 min-w-0">
									<div class="flex items-center gap-2 flex-wrap">
										{#if s.status === 'pushed'}
											<span class="text-xs px-1.5 py-0.5 rounded bg-green-900/40 text-green-300">pushed</span>
										{:else if s.status === 'failed'}
											<span class="text-xs px-1.5 py-0.5 rounded bg-red-900/40 text-red-300">failed</span>
										{:else}
											<span class="text-xs px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">{s.status}</span>
										{/if}
										<span class="text-xs text-slate-500">{s.is_automatic ? 'auto' : 'manual'}</span>
										{#if s.commit_sha}
											{#if backupSettings?.github_repo}
												<a href="https://github.com/{backupSettings.github_repo}/commit/{s.commit_sha}"
													target="_blank" rel="noopener noreferrer"
													class="text-xs font-mono text-ocean-400 hover:text-ocean-300">
													{s.commit_sha.slice(0, 7)}
												</a>
											{:else}
												<span class="text-xs font-mono text-slate-400">{s.commit_sha.slice(0, 7)}</span>
											{/if}
										{/if}
										<span class="text-xs text-slate-500">{new Date(s.created_at).toLocaleString()}</span>
									</div>
									{#if s.commit_message}
										<div class="text-xs text-slate-400 mt-1 truncate">{s.commit_message}</div>
									{/if}
									{#if s.error_message}
										<div class="text-xs text-red-400 mt-1 break-words">{s.error_message}</div>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	{:else if tabType === 'danger'}
	<div class="space-y-6 max-w-2xl">
		<div>
			<h2 class="text-base font-semibold text-red-300">Delete this lab</h2>
			<p class="text-sm text-slate-400 mt-1">
				Permanently removes <strong class="text-white">{data.lab?.name ?? 'this lab'}</strong> and
				<strong class="text-red-300">every project, site, sample, extract, PCR plate, library
				plate, sequencing run, analysis, personnel record, picklist, primer set, PCR protocol,
				saved cart, invite, snapshot history record, and feedback row</strong> in it.
				Members keep their accounts but lose access to this lab — they can start a new lab
				or accept an invite to another one.
			</p>
			<p class="text-xs text-slate-500 mt-2">
				If you have configured GitHub backups, the JSON snapshot in your backup repo is
				NOT deleted — that's your safety net. Pull a fresh snapshot first if you want a
				point-in-time export before the delete.
			</p>
		</div>

		<form onsubmit={(e) => { e.preventDefault(); deleteLab(); }}
			class="p-4 rounded-lg border border-red-900/60 bg-red-950/20 space-y-3">
			<label for="del-lab" class="block text-xs text-slate-300">
				Type the lab name <code class="text-red-300">{data.lab?.name ?? ''}</code> exactly to confirm:
			</label>
			<input id="del-lab" type="text" bind:value={deleteLabConfirm}
				autocomplete="off"
				class="{inputCls} border-red-900 focus:border-red-500" />
			{#if deleteLabError}
				<div class="text-xs text-red-400">{deleteLabError}</div>
			{/if}
			<button type="submit" disabled={deleteLabBusy || deleteLabConfirm !== (data.lab?.name ?? '__no__')}
				class="px-3 py-2 bg-red-700 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 text-sm font-medium">
				{deleteLabBusy ? 'Deleting…' : 'Permanently delete this lab'}
			</button>
		</form>
	</div>

	{/if}
</div>
