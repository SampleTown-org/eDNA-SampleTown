<script lang="ts">
	import DataTable from '$lib/components/DataTable.svelte';
	import PeopleRoster from '$lib/components/PeopleRoster.svelte';
	import GlossaryDoc from '$lib/components/GlossaryDoc.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();

	const ext = data.extract as any;

	const pcrColumns = [
		{ key: 'pcr_name', label: 'PCR', sortable: true },
		{ key: 'target_gene', label: 'Target', sortable: true },
		{ key: 'target_subfragment', label: 'Region', sortable: true },
		{ key: 'concentration_ng_ul', label: 'Conc.', sortable: true },
		{ key: 'pcr_date', label: 'Date', sortable: true }
	];
	const libColumns = [
		{ key: 'library_name', label: 'Library', sortable: true },
		{ key: 'library_type', label: 'Type', sortable: true },
		{ key: 'platform', label: 'Platform', sortable: true }
	];

	/** Per-section field lists. Each row is `[label, value, mixsSlot?]`; the
	 *  optional MIxS slot triggers a GlossaryDoc tooltip on the label. */
	type Row = [string, unknown, string?];
	const identityRows: Row[] = [
		['Extract Name', ext.extract_name],
		['Extraction Date', ext.extraction_date, 'extraction_date'],
		['Nucleic Acid Type', ext.nucl_acid_type]
	];
	const protocolRows: Row[] = [
		['Extraction Method / Kit', ext.extraction_method],
		['Extraction Kit (MIxS)', ext.nucl_acid_ext_kit, 'nucl_acid_ext_kit'],
		['Extraction Protocol (MIxS)', ext.nucl_acid_ext, 'nucl_acid_ext'],
		['Sample Taxon ID', ext.samp_taxon_id, 'samp_taxon_id'],
		['Sample Volume / Weight', ext.samp_vol_we_dna_ext, 'samp_vol_we_dna_ext'],
		['Pool of DNA Extracts', ext.pool_dna_extracts, 'pool_dna_extracts']
	];
	const qcRows: Row[] = [
		['Concentration', ext.concentration_ng_ul != null ? `${ext.concentration_ng_ul} ng/µL` : null],
		['Volume', ext.total_volume_ul != null ? `${ext.total_volume_ul} µL` : null],
		['260/280', ext.a260_280],
		['260/230', ext.a260_230],
		['Quantification', ext.quantification_method]
	];
	const storageRows: Row[] = [
		['Room/Freezer', ext.storage_room],
		['Storage Box', ext.storage_box],
		['Storage Location', ext.storage_location]
	];
	const sections: { title: string; rows: Row[] }[] = [
		{ title: 'Identity', rows: identityRows },
		{ title: 'Protocol', rows: protocolRows },
		{ title: 'Quantification', rows: qcRows },
		{ title: 'Storage', rows: storageRows }
	].map((s) => ({ title: s.title, rows: s.rows.filter(([, v]) => v != null && v !== '') }))
	  .filter((s) => s.rows.length > 0);

	/** Custom-fields JSON spill (off-schema annotations from import). */
	const customFields: Array<[string, unknown]> = (() => {
		if (!ext.custom_fields) return [];
		try {
			const obj = typeof ext.custom_fields === 'string' ? JSON.parse(ext.custom_fields) : ext.custom_fields;
			if (!obj || typeof obj !== 'object') return [];
			return Object.entries(obj).filter(([, v]) => v != null && v !== '');
		} catch { return []; }
	})();

	const fieldRowCls = 'flex justify-between py-1 border-b border-slate-800/50';
	const labelCls = 'text-slate-400';
	const valueCls = 'text-slate-200';
</script>

<div class="space-y-6">
	<div>
		<a href="/extracts" class="text-sm text-slate-400 hover:text-ocean-400">&larr; Extracts</a>
		<div class="flex items-center justify-between mt-1">
			<h1 class="text-2xl font-bold text-white">{ext.extract_name}</h1>
			<a href="/extracts/{ext.id}/edit" class="hidden sm:inline-flex px-3 py-1.5 border border-slate-700 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors text-sm font-medium">Edit</a>
		</div>
		<p class="text-slate-400 mt-1">Sample: <a href="/samples/{ext.sample_id}" class="text-ocean-400 hover:text-ocean-300">{ext.samp_name}</a></p>
	</div>

	{#each sections as sec}
		<div class="rounded-lg border border-slate-800 p-5 space-y-3">
			<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">{sec.title}</h2>
			<dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
				{#each sec.rows as [label, value, slot]}
					<div class={fieldRowCls}>
						<dt class={labelCls}>
							{#if slot}<GlossaryDoc {slot} {label} />{:else}{label}{/if}
						</dt>
						<dd class={valueCls}>{value}</dd>
					</div>
				{/each}
			</dl>
		</div>
	{/each}

	{#if customFields.length > 0}
		<div class="rounded-lg border border-slate-800 p-5 space-y-3">
			<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">
				Additional parameters
				<span class="text-xs text-slate-500 normal-case tracking-normal font-normal">({customFields.length})</span>
			</h2>
			<dl class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
				{#each customFields as [k, v]}
					<div class={fieldRowCls}>
						<dt class={labelCls}><span class="font-mono text-xs text-slate-500">{k}</span></dt>
						<dd class={valueCls}>{v}</dd>
					</div>
				{/each}
			</dl>
		</div>
	{/if}

	{#if ext.notes}<div class="rounded-lg border border-slate-800 p-5"><h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-2">Notes</h2><p class="text-sm text-slate-300">{ext.notes}</p></div>{/if}

	{#if data.people.length > 0}
		<div class="rounded-lg border border-slate-800 p-5 space-y-3">
			<h2 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">People</h2>
			<PeopleRoster people={data.people} />
		</div>
	{/if}

	<div>
		<div class="flex items-center justify-between mb-3">
			<h2 class="text-lg font-semibold text-white">PCR Amplifications ({data.pcrs.length})</h2>
			<a href="/pcr/new?extract_id={data.extract.id}" class="hidden sm:inline-flex px-3 py-1.5 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">Add PCR</a>
		</div>
		<DataTable columns={pcrColumns} rows={data.pcrs} href={(row) => `/pcr/${row.id}`} empty="No PCR amplifications yet." />
	</div>

	<div>
		<div class="flex items-center justify-between mb-3">
			<h2 class="text-lg font-semibold text-white">Direct Library Preps ({data.libraries.length})</h2>
			<a href="/libraries/new?extract_id={data.extract.id}" class="hidden sm:inline-flex px-3 py-1.5 bg-ocean-600 text-white rounded-lg hover:bg-ocean-500 transition-colors text-sm font-medium">Add Library</a>
		</div>
		<DataTable columns={libColumns} rows={data.libraries} href={(row) => `/libraries/${row.id}`} empty="No direct library preps yet." />
	</div>
</div>
