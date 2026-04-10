<script lang="ts">
	import { page } from '$app/stores';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	const CATEGORY_LABELS: Record<string, string> = {
		geo_loc_name: 'Geographic Locations',
		locality: 'Localities',
		habitat_type: 'Habitat Types',
		env_broad_scale: 'Broad-scale Environment',
		env_local_scale: 'Local Environment',
		env_medium: 'Environmental Medium',
		sample_type: 'Sample Types',
		filter_type: 'Filter Types',
		preservation_method: 'Preservation Methods',
		storage_conditions: 'Storage Conditions',
		storage_room: 'Storage Rooms/Freezers',
		storage_box: 'Storage Boxes',
		extraction_method: 'Extraction Methods',
		extraction_kit: 'Extraction Kits',
		library_prep_kit: 'Library Prep Kits',
		library_type: 'Library Types',
		seq_platform: 'Platforms',
		seq_instrument: 'Instruments',
		seq_method: 'Seq Methods',
		index_i7: 'i7 Indices',
		index_i5: 'i5 Indices',
		barcode: 'Barcodes'
	};

	type TabType = 'naming' | 'category' | 'primers' | 'protocols' | 'people' | 'feedback';
	let feedbackItems = $state(structuredClone(data.feedback) as any[]);
	let personnelList = $state(structuredClone(data.personnel) as any[]);

	// --- Personnel CRUD ---
	const ROLES = ['PI', 'Co-PI', 'Lab Manager', 'Postdoc', 'PhD Student', 'MSc Student', 'Undergrad', 'Field Tech', 'Lab Tech', 'Bioinformatician', 'Collaborator', 'Other'];
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

	async function resolveFeedback(id: string, status: string) {
		await fetch(`/api/feedback`, { method: 'GET' }); // just refresh
		feedbackItems = feedbackItems.map(f => f.id === id ? { ...f, status } : f);
		// Persist status - we need a PUT endpoint, but for now just update locally
	}

	// Support ?tab= URL parameter to deep-link to a category
	const urlTab = $page.url.searchParams.get('tab');
	const initialTab: TabType = urlTab === 'naming' ? 'naming' : urlTab === 'primers' ? 'primers' : urlTab === 'protocols' ? 'protocols' : urlTab === 'people' ? 'people' : urlTab === 'feedback' ? 'feedback' : 'category';
	const initialCategory = (urlTab && urlTab in CATEGORY_LABELS) ? urlTab : 'geo_loc_name';

	let tabType = $state<TabType>(initialTab);
	let categories = $state(structuredClone(data.categories) as Record<string, any[]>);
	let activeCategory = $state(initialCategory);
	let primerSets = $state(structuredClone(data.primerSets) as any[]);
	let pcrProtocols = $state(structuredClone(data.pcrProtocols) as any[]);

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
	const emptyProtocol = () => ({ name: '', polymerase: '', annealing_temp_c: '' as string | number, num_cycles: '' as string | number, pcr_conditions: '' });
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
		editProtocol = { name: proto.name, polymerase: proto.polymerase || '', annealing_temp_c: proto.annealing_temp_c ?? '', num_cycles: proto.num_cycles ?? '', pcr_conditions: proto.pcr_conditions || '' };
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
		<h1 class="text-2xl font-bold text-white">Settings</h1>
		<p class="text-slate-400 mt-1 text-sm">Manage picklists, primer sets, and PCR protocols.</p>
	</div>

	{#if errorMsg}<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>{/if}

	<!-- Top-level tabs -->
	<div class="flex gap-1 p-1 bg-slate-800 rounded-lg w-fit">
		<button onclick={() => tabType = 'naming'} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {tabType === 'naming' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">Naming</button>
		<button onclick={() => tabType = 'category'} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {tabType === 'category' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">Picklists</button>
		<button onclick={() => tabType = 'primers'} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {tabType === 'primers' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">Primer Sets</button>
		<button onclick={() => tabType = 'protocols'} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {tabType === 'protocols' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">PCR Protocols</button>
		<button onclick={() => tabType = 'people'} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {tabType === 'people' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">People</button>
		<button onclick={() => tabType = 'feedback'} class="px-4 py-1.5 rounded text-sm font-medium transition-colors {tabType === 'feedback' ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">
			Feedback
			{#if feedbackItems.filter(f => f.status === 'open').length > 0}
				<span class="ml-1 px-1.5 py-0.5 bg-red-600 text-white text-xs rounded-full">{feedbackItems.filter(f => f.status === 'open').length}</span>
			{/if}
		</button>
	</div>

	{#if tabType === 'naming'}
	<div class="space-y-4">
		<p class="text-sm text-slate-400">Set the default placeholder template for each name field. Use <code class="text-ocean-400">{'{'}Field{'}'}</code> tokens as reminders of the naming convention.</p>
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
	<!-- Category tabs -->
	<div class="flex flex-wrap gap-1 p-1 bg-slate-800/50 rounded-lg">
		{#each Object.keys(CATEGORY_LABELS) as cat}
			<button onclick={() => { activeCategory = cat; clearMsg(); }}
				class="px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap {activeCategory === cat ? 'bg-ocean-600 text-white' : 'text-slate-400 hover:text-white'}">
				{CATEGORY_LABELS[cat]}
			</button>
		{/each}
	</div>

	<div class="space-y-2">
		<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">{CATEGORY_LABELS[activeCategory]}</h2>
		<div class="space-y-1 max-h-96 overflow-y-auto">
			{#each (categories[activeCategory] || []) as item}
			<div class="flex items-center gap-2 p-2 rounded-lg {item.is_active ? 'bg-slate-800/50' : 'bg-slate-900/50 opacity-50'}">
				{#if editingId === item.id}
					<input type="text" bind:value={editValue} class="flex-1 {inputCls} text-sm" onkeydown={(e) => { if (e.key === 'Enter') saveEdit(item); if (e.key === 'Escape') { editingId = ''; } }} />
					<button onclick={() => saveEdit(item)} class="text-xs text-green-400 hover:text-green-300">Save</button>
					<button onclick={() => { editingId = ''; }} class="text-xs text-slate-500 hover:text-slate-300">Cancel</button>
				{:else}
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
					{#each primerSets as ps}
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

	{:else}
	<!-- PCR Protocols -->
	<div class="space-y-3">
		<div class="space-y-2">
			{#each pcrProtocols as proto}
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
				{#if proto.pcr_conditions}<p class="text-xs text-slate-500 mt-1 font-mono">{proto.pcr_conditions}</p>{/if}
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
				<div><label class="block text-xs text-slate-400 mb-1">PCR Conditions</label><input type="text" bind:value={editProtocol.pcr_conditions} class="w-full {inputCls} text-sm" /></div>
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
					<div><label class="block text-xs text-slate-400 mb-1">PCR Conditions</label><input type="text" bind:value={newProtocol.pcr_conditions} class="w-full {inputCls} text-sm" placeholder="e.g., 98°C 30s; 30x(...)" /></div>
				</div>
				<button type="submit" disabled={!newProtocol.name.trim()} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 text-sm font-medium">Add Protocol</button>
			</form>
		</details>
		{/if}
	</div>

	{:else if tabType === 'people'}
	<div class="space-y-4">
		<p class="text-sm text-slate-400">Lab members and collaborators. Link to GitHub accounts for authentication.</p>

		<div class="space-y-2">
			{#each personnelList as person}
			<div class="p-3 rounded-lg bg-slate-800/50 {person.is_active ? '' : 'opacity-50'}">
				<div class="flex items-start justify-between gap-3">
					<div class="flex items-center gap-3">
						{#if person.avatar_url}
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
						<button onclick={() => startEditPerson(person)} class="text-xs text-slate-500 hover:text-ocean-400">Edit</button>
						<button onclick={() => removePerson(person.id)} class="text-xs text-slate-600 hover:text-red-400">Del</button>
					</div>
				</div>
			</div>
			{/each}
		</div>

		{#if editingPersonId}
		<form onsubmit={(e) => { e.preventDefault(); saveEditPerson(); }} class="space-y-3 p-4 bg-slate-800/30 rounded-lg border border-ocean-700">
			<p class="text-sm font-medium text-ocean-400">Editing person</p>
			<div class="grid grid-cols-2 gap-3">
				<div><label class="block text-xs text-slate-400 mb-1">Full Name</label><input type="text" bind:value={editPerson.full_name} class="w-full {inputCls} text-sm" /></div>
				<div><label class="block text-xs text-slate-400 mb-1">Role</label>
					<select bind:value={editPerson.role} class="w-full {selectCls} text-sm">
						<option value="">Select...</option>
						{#each ROLES as r}<option>{r}</option>{/each}
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
		{:else}
		<details class="group">
			<summary class="text-sm font-medium text-ocean-400 cursor-pointer hover:text-ocean-300">Add person</summary>
			<form onsubmit={(e) => { e.preventDefault(); addPerson(); }} class="space-y-3 mt-3 p-4 bg-slate-800/30 rounded-lg">
				<div class="grid grid-cols-2 gap-3">
					<div><label class="block text-xs text-slate-400 mb-1">Full Name</label><input type="text" bind:value={newPerson.full_name} class="w-full {inputCls} text-sm" placeholder="e.g., Jane Smith" /></div>
					<div><label class="block text-xs text-slate-400 mb-1">Role</label>
						<select bind:value={newPerson.role} class="w-full {selectCls} text-sm">
							<option value="">Select...</option>
							{#each ROLES as r}<option>{r}</option>{/each}
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
		{/if}
	</div>

	{:else if tabType === 'feedback'}
	<div class="space-y-3">
		<p class="text-sm text-slate-400">User-submitted feedback from across the site.</p>
		{#if feedbackItems.length === 0}
			<p class="text-sm text-slate-500">No feedback yet.</p>
		{:else}
			<div class="space-y-2">
				{#each feedbackItems as item}
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
						{#if item.status === 'open'}
							<button onclick={() => { item.status = 'resolved'; feedbackItems = [...feedbackItems]; }} class="text-xs text-slate-500 hover:text-green-400 shrink-0">Resolve</button>
						{/if}
					</div>
				</div>
				{/each}
			</div>
		{/if}
	</div>
	{/if}
</div>
