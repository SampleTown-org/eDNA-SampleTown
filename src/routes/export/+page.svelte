<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<div class="space-y-6">
	<h1 class="text-2xl font-bold text-white">Export</h1>

	<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
		<div class="p-5 rounded-lg border border-slate-800 bg-slate-900/50 space-y-3">
			<h2 class="text-lg font-semibold text-white">SRA / BioSample</h2>
			<p class="text-sm text-slate-400">Export MIxS-compliant TSV files for NCBI SRA and BioSample submission.</p>
			<div class="text-sm text-slate-500">
				{data.sampleCount} samples across {data.projectCount} projects
			</div>
			<button
				disabled
				class="px-4 py-2 bg-ocean-600 text-white rounded-lg opacity-50 cursor-not-allowed text-sm font-medium"
			>
				Export TSV (coming soon)
			</button>
		</div>

		<div class="p-5 rounded-lg border border-slate-800 bg-slate-900/50 space-y-3">
			<h2 class="text-lg font-semibold text-white">EBI / ENA</h2>
			<p class="text-sm text-slate-400">Export metadata for European Nucleotide Archive submission.</p>
			<button
				disabled
				class="px-4 py-2 bg-ocean-600 text-white rounded-lg opacity-50 cursor-not-allowed text-sm font-medium"
			>
				Export XML (coming soon)
			</button>
		</div>
	</div>
</div>
