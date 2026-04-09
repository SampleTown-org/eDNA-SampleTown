<script lang="ts">
	import { goto } from '$app/navigation';

	let form = $state({
		project_name: '',
		description: '',
		pi_name: '',
		institution: '',
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
			body: JSON.stringify(form)
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
			<label for="project_name" class="block text-sm font-medium text-slate-300 mb-1">Project Name *</label>
			<input
				id="project_name"
				type="text"
				bind:value={form.project_name}
				class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500"
				placeholder="e.g., Arctic eDNA Survey 2026"
			/>
		</div>

		<div>
			<label for="description" class="block text-sm font-medium text-slate-300 mb-1">Description</label>
			<textarea
				id="description"
				bind:value={form.description}
				rows="3"
				class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500"
				placeholder="Brief description of the project"
			></textarea>
		</div>

		<div class="grid grid-cols-2 gap-4">
			<div>
				<label for="pi_name" class="block text-sm font-medium text-slate-300 mb-1">Principal Investigator</label>
				<input
					id="pi_name"
					type="text"
					bind:value={form.pi_name}
					class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500"
				/>
			</div>
			<div>
				<label for="institution" class="block text-sm font-medium text-slate-300 mb-1">Institution</label>
				<input
					id="institution"
					type="text"
					bind:value={form.institution}
					class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500"
				/>
			</div>
		</div>

		<div>
			<label for="github_repo" class="block text-sm font-medium text-slate-300 mb-1">GitHub Repository</label>
			<input
				id="github_repo"
				type="text"
				bind:value={form.github_repo}
				class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500"
				placeholder="e.g., org/repo-name"
			/>
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
