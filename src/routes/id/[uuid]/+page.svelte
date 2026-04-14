<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	/** Entity types a user can claim a scanned UUID for. Offline-eligible
	 *  entities (project/site/sample) are listed first; the rest require
	 *  an online connection since their forms load server-side data. */
	/** Order mirrors the top-level app nav: Projects → Sites → Samples →
	 *  Extracts → PCR → Libraries → Runs. The `offline` flag just decorates
	 *  the card for the field-use scenario — routing is identical. */
	const CLAIMABLE = [
		{ type: 'project', label: 'Project', offline: true, href: `/projects/new?id=${data.uuid}` },
		{ type: 'site', label: 'Site', offline: true, href: `/sites/new?id=${data.uuid}` },
		{ type: 'sample', label: 'Sample', offline: true, href: `/samples/new?id=${data.uuid}` },
		{ type: 'extract', label: 'Extract', offline: false, href: `/extracts/new?id=${data.uuid}` },
		{ type: 'pcr_plate', label: 'PCR Plate', offline: false, href: `/pcr/new?id=${data.uuid}` },
		{ type: 'library_plate', label: 'Library Plate', offline: false, href: `/libraries/new?id=${data.uuid}` },
		{ type: 'run', label: 'Sequencing Run', offline: false, href: `/runs/new?id=${data.uuid}` }
	];
</script>

<div class="max-w-xl mx-auto space-y-6 py-8">
	<div>
		<h1 class="text-2xl font-bold text-white">Claim this ID</h1>
		<p class="text-slate-400 mt-1">
			<span class="font-mono text-xs text-slate-500">{data.uuid}</span>
		</p>
		<p class="text-slate-300 mt-3 text-sm">
			This code isn't assigned yet. What should it become?
		</p>
	</div>

	<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
		{#each CLAIMABLE as c}
			<a
				href={c.href}
				class="rounded-lg border border-slate-800 p-4 hover:border-ocean-700 hover:bg-slate-900/50 transition-colors"
			>
				<div class="text-lg font-semibold text-white">{c.label}</div>
				<div class="text-xs text-slate-500 mt-1">
					{c.offline ? 'Available offline' : 'Requires connection'}
				</div>
			</a>
		{/each}
	</div>
</div>
