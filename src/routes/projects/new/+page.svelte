<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import FieldLabel from '$lib/components/FieldLabel.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const scannedId = $derived(page.url.searchParams.get('id') || '');

	const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';

	let form = $state({
		project_name: '',
		description: '',
		pi_name: '',
		institution: '',
		contact_email: '',
		funding_sources: '',
		github_repo: ''
	});

	let saving = $state(false);
	let error = $state('');

	async function submit() {
		if (!form.project_name.trim()) {
			error = 'Project name is required';
			return;
		}
		saving = true;
		error = '';

		const res = await fetch('/api/projects', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...(scannedId ? { id: scannedId } : {}), ...form })
		});

		if (res.ok) {
			const project = await res.json();
			goto(`/projects/${project.id}`);
		} else {
			error = 'Failed to create project';
			saving = false;
		}
	}
</script>

<div class="max-w-2xl space-y-6">
	<h1 class="text-2xl font-bold text-white">New Project</h1>

	{#if error}
		<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{error}</div>
	{/if}

	<form onsubmit={(e) => { e.preventDefault(); submit(); }} class="space-y-4">
		<div>
			<FieldLabel slot="project_name" for="project_name" label="Project Name" required description="SampleTown-local project identifier. Maps to MIxS project_name at export time." />
			<input id="project_name" type="text" bind:value={form.project_name} class={inputCls}
				placeholder={data.namingTemplates?.project_name || 'e.g., Arctic eDNA Survey 2026'} />
		</div>

		<div>
			<FieldLabel slot="description" for="description" label="Description" description="Brief description of the project's scope and goals." />
			<textarea id="description" bind:value={form.description} rows="3" class={inputCls}
				placeholder="Brief description of the project"></textarea>
		</div>

		<div class="grid grid-cols-2 gap-4">
			<div>
				<FieldLabel slot="pi_name" for="pi_name" label="Principal Investigator" description="Name of the PI or project lead. Stored locally; does not auto-export to MIxS." />
				<input id="pi_name" type="text" bind:value={form.pi_name} class={inputCls} />
			</div>
			<div>
				<FieldLabel slot="institution" for="institution" label="Institution" description="PI's affiliation (university, institute, lab)." />
				<input id="institution" type="text" bind:value={form.institution} class={inputCls} />
			</div>
		</div>

		<div>
			<FieldLabel slot="contact_email" for="contact_email" label="Contact Email" description="Where to route questions about this project — PI's email, lab mailbox, or grant manager. Free-text, no validation." />
			<input id="contact_email" type="email" bind:value={form.contact_email} class={inputCls}
				placeholder="lab@example.org" />
		</div>

		<div>
			<FieldLabel slot="funding_sources" for="funding_sources" label="Funding Sources" description="Grant numbers, agency names, or program identifiers — one per line is conventional but any free-text works." />
			<textarea id="funding_sources" bind:value={form.funding_sources} rows="3" class={inputCls}
				placeholder="e.g.&#10;NSERC RGPIN-2024-12345&#10;Genome BC SIP 2025"></textarea>
		</div>

		<div>
			<FieldLabel slot="github_repo" for="github_repo" label="GitHub Repository" description="Repository where project DB snapshots are committed (e.g., org/repo-name). Optional." />
			<input id="github_repo" type="text" bind:value={form.github_repo} class={inputCls}
				placeholder="e.g., org/repo-name" />
			<p class="text-xs text-slate-500 mt-1">Repository for DB snapshots (optional)</p>
		</div>

		<div class="flex gap-3 pt-2">
			<button
				type="submit"
				disabled={saving}
				class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium"
			>
				{saving ? 'Creating...' : 'Create Project'}
			</button>
			<a href="/projects" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">
				Cancel
			</a>
		</div>
	</form>
</div>
