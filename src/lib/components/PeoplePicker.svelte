<script lang="ts">
	/**
	 * People attribution chip list with a "+ Add" affordance.
	 *
	 * Bound to a `people: Array<{personnel_id, role}>` array on the parent.
	 * Each chip shows the person's full name + role; clicking × removes the
	 * entry. The "+ Add" button reveals a row with a personnel dropdown +
	 * a role dropdown (free text via datalist).
	 *
	 * The picker doesn't filter out already-attributed personnel — the same
	 * person can appear twice with different roles (e.g. "collector" + "lab
	 * tech").
	 */

	type Personnel = {
		id: string;
		full_name: string;
		role?: string | null;
		email?: string | null;
	};
	type RoleOption = { value: string; label?: string };
	type PersonAttribution = { personnel_id: string; role?: string | null };

	interface Props {
		people: PersonAttribution[];
		personnel: Personnel[];
		roleOptions?: RoleOption[];
		defaultRole?: string;
		label?: string;
	}

	let {
		people = $bindable([]),
		personnel,
		roleOptions = [],
		defaultRole = '',
		label = 'People'
	}: Props = $props();

	const personById = $derived(new Map(personnel.map((p) => [p.id, p])));

	let showAddRow = $state(false);
	let pickerPersonnelId = $state('');
	let pickerRole = $state(defaultRole);

	function addPerson() {
		if (!pickerPersonnelId) return;
		people = [...people, { personnel_id: pickerPersonnelId, role: pickerRole || null }];
		pickerPersonnelId = '';
		pickerRole = defaultRole;
		showAddRow = false;
	}

	function removePerson(idx: number) {
		people = people.filter((_, i) => i !== idx);
	}

	function chipColor(role: string | null | undefined): string {
		// Stable color tag from role name; matches the DataTable color-by hash.
		if (!role) return 'bg-slate-700/60 text-slate-300 border-slate-700';
		let h = 0;
		for (let i = 0; i < role.length; i++) h = (h * 31 + role.charCodeAt(i)) | 0;
		const hue = Math.abs(h) % 360;
		return `text-white border-transparent`;
	}

	function chipStyle(role: string | null | undefined): string {
		if (!role) return '';
		let h = 0;
		for (let i = 0; i < role.length; i++) h = (h * 31 + role.charCodeAt(i)) | 0;
		const hue = Math.abs(h) % 360;
		return `background-color: hsl(${hue}, 30%, 28%);`;
	}
</script>

<div class="space-y-2">
	<label class="block text-sm font-medium text-slate-300">
		<a href="/settings?tab=people" target="_blank" class="hover:text-ocean-400">{label}</a>
	</label>

	<div class="flex flex-wrap gap-2 items-center">
		{#each people as p, idx}
			{@const person = personById.get(p.personnel_id)}
			<span
				class="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs border {chipColor(p.role)}"
				style={chipStyle(p.role)}
			>
				<span>{person?.full_name ?? '(unknown)'}</span>
				{#if p.role}
					<span class="opacity-70">· {p.role}</span>
				{/if}
				<button
					type="button"
					onclick={() => removePerson(idx)}
					class="opacity-60 hover:opacity-100 hover:text-red-200"
					title="Remove"
				>×</button>
			</span>
		{/each}

		{#if !showAddRow}
			<button
				type="button"
				onclick={() => {
					showAddRow = true;
					pickerRole = defaultRole;
				}}
				class="inline-flex items-center px-2 py-1 rounded text-xs border border-dashed border-slate-700 text-slate-400 hover:text-ocean-400 hover:border-ocean-700"
			>+ Person</button>
		{/if}
	</div>

	{#if showAddRow}
		<div class="flex flex-wrap gap-2 items-end p-3 rounded-lg bg-slate-800/40 border border-slate-800">
			<div class="flex-1 min-w-44">
				<label class="block text-xs text-slate-500 mb-1">Person</label>
				<select
					bind:value={pickerPersonnelId}
					class="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500"
				>
					<option value="">Select...</option>
					{#each personnel as p}
						<option value={p.id}>{p.full_name}{p.role ? ` (${p.role})` : ''}</option>
					{/each}
				</select>
			</div>
			<div class="flex-1 min-w-36">
				<label class="block text-xs text-slate-500 mb-1">Role</label>
				<input
					type="text"
					bind:value={pickerRole}
					list="person-role-options"
					placeholder={defaultRole || 'e.g., collector'}
					class="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-ocean-500"
				/>
				<datalist id="person-role-options">
					{#each roleOptions as r}<option value={r.value}>{r.label ?? r.value}</option>{/each}
				</datalist>
			</div>
			<div class="flex gap-2">
				<button
					type="button"
					onclick={addPerson}
					disabled={!pickerPersonnelId}
					class="px-3 py-1.5 bg-ocean-600 text-white rounded hover:bg-ocean-500 disabled:opacity-50 text-sm font-medium"
				>Add</button>
				<button
					type="button"
					onclick={() => {
						showAddRow = false;
						pickerPersonnelId = '';
					}}
					class="px-3 py-1.5 border border-slate-700 text-slate-300 rounded hover:bg-slate-800 text-sm"
				>Cancel</button>
			</div>
		</div>
	{/if}
</div>
