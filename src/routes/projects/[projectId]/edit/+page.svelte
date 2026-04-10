<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let form = $state({
		project_name: data.project.project_name || '',
		description: data.project.description || '',
		pi_name: data.project.pi_name || '',
		institution: data.project.institution || '',
		github_repo: data.project.github_repo || ''
	});

	let saving = $state(false);
	let errorMsg = $state('');

	async function submit() {
		saving = true;
		errorMsg = '';
		const res = await fetch(`/api/projects/${data.project.id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(form)
		});
		if (res.ok) {
			goto(`/projects/${data.project.id}`);
		} else {
			errorMsg = (await res.json().catch(() => ({}))).error || 'Failed to update project';
			saving = false;
		}
	}

	const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';
</script>

<div class="max-w-3xl space-y-6">
	<div>
		<a href="/projects" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Projects</a>
		<h1 class="text-2xl font-bold text-white mt-1">Edit {data.project.project_name}</h1>
	</div>

	{#if errorMsg}
		<div class="p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm">{errorMsg}</div>
	{/if}

	<form onsubmit={(e) => { e.preventDefault(); submit(); }} class="space-y-6">
		<div>
			<label for="project_name" class="block text-sm font-medium text-slate-300 mb-1">Project Name</label>
			<input id="project_name" type="text" bind:value={form.project_name} class={inputCls} />
		</div>
		<div>
			<label for="description" class="block text-sm font-medium text-slate-300 mb-1">Description</label>
			<textarea id="description" bind:value={form.description} rows="3" class={inputCls}></textarea>
		</div>
		<div>
			<label for="pi_name" class="block text-sm font-medium text-slate-300 mb-1">PI Name</label>
			<input id="pi_name" type="text" bind:value={form.pi_name} class={inputCls} />
		</div>
		<div>
			<label for="institution" class="block text-sm font-medium text-slate-300 mb-1">Institution</label>
			<input id="institution" type="text" bind:value={form.institution} class={inputCls} />
		</div>
		<div>
			<label for="github_repo" class="block text-sm font-medium text-slate-300 mb-1">GitHub Repo</label>
			<input id="github_repo" type="text" bind:value={form.github_repo} class={inputCls} />
		</div>

		<div class="flex gap-3 pt-2">
			<button type="submit" disabled={saving} class="px-4 py-2 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 disabled:opacity-50 transition-colors text-sm font-medium">
				{saving ? 'Saving...' : 'Save'}
			</button>
			<a href="/projects/{data.project.id}" class="px-4 py-2 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Cancel</a>
		</div>
	</form>
</div>
