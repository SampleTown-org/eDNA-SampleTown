<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="space-y-8">
	<div>
		<h1 class="text-3xl font-bold text-white tracking-tight">SampleTown</h1>
		<p class="text-slate-400 mt-1">eDNA sample tracking &middot; MIxS-compliant</p>
	</div>

	<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
		<a href="/projects" class="block p-5 rounded-lg border border-slate-800 bg-slate-900/50 hover:border-ocean-700 transition-colors">
			<div class="text-2xl font-bold text-ocean-400">{data.counts.projects}</div>
			<div class="text-sm text-slate-400 mt-1">Projects</div>
		</a>
		<a href="/samples" class="block p-5 rounded-lg border border-slate-800 bg-slate-900/50 hover:border-ocean-700 transition-colors">
			<div class="text-2xl font-bold text-ocean-400">{data.counts.samples}</div>
			<div class="text-sm text-slate-400 mt-1">Samples</div>
		</a>
		<a href="/extracts" class="block p-5 rounded-lg border border-slate-800 bg-slate-900/50 hover:border-ocean-700 transition-colors">
			<div class="text-2xl font-bold text-ocean-400">{data.counts.extracts}</div>
			<div class="text-sm text-slate-400 mt-1">DNA Extracts</div>
		</a>
		<a href="/runs" class="block p-5 rounded-lg border border-slate-800 bg-slate-900/50 hover:border-ocean-700 transition-colors">
			<div class="text-2xl font-bold text-ocean-400">{data.counts.runs}</div>
			<div class="text-sm text-slate-400 mt-1">Sequencing Runs</div>
		</a>
	</div>

	{#if data.recentSamples.length > 0}
		<div>
			<h2 class="text-lg font-semibold text-white mb-3">Recent Samples</h2>
			<div class="overflow-x-auto rounded-lg border border-slate-800">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-slate-800 bg-slate-900/50">
							<th class="px-4 py-3 text-left font-medium text-slate-400">Name</th>
							<th class="px-4 py-3 text-left font-medium text-slate-400">Project</th>
							<th class="px-4 py-3 text-left font-medium text-slate-400">Checklist</th>
							<th class="px-4 py-3 text-left font-medium text-slate-400">Location</th>
							<th class="px-4 py-3 text-left font-medium text-slate-400">Collected</th>
						</tr>
					</thead>
					<tbody>
						{#each data.recentSamples as sample}
							<tr class="border-b border-slate-800/50 hover:bg-slate-800/30">
								<td class="px-4 py-3">
									<a href="/samples/{sample.id}" class="text-ocean-400 hover:text-ocean-300">{sample.samp_name}</a>
								</td>
								<td class="px-4 py-3 text-slate-300">{sample.project_name}</td>
								<td class="px-4 py-3">
									<span class="px-2 py-0.5 text-xs rounded bg-slate-800 text-slate-300">{sample.mixs_checklist}</span>
								</td>
								<td class="px-4 py-3 text-slate-300">{sample.geo_loc_name}</td>
								<td class="px-4 py-3 text-slate-400">{sample.collection_date}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

</div>
