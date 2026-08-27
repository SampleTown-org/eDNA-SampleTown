<script lang="ts">
	import { insdcUrl, insdcLabel } from '$lib/insdc-links';

	/**
	 * The INSDC accession a record was imported under, linked to its archive
	 * page. Records entered by hand have never been submitted anywhere and
	 * carry none, so nothing renders for them.
	 *
	 * An accession whose prefix isn't recognized is still shown — it identifies
	 * the record wherever it came from — but is not linked, because there is no
	 * page to send the reader to.
	 */
	let { accession, class: klass = '' }: { accession: unknown; class?: string } = $props();

	const value = $derived(accession ? String(accession).trim() : '');
	const url = $derived(insdcUrl(value));
</script>

{#if value}
	{#if url}
		<a
			href={url}
			target="_blank"
			rel="noopener noreferrer"
			class="inline-block font-mono text-xs text-ocean-400 hover:text-ocean-300 hover:underline {klass}"
			title={insdcLabel(value)}
		>{value} ↗</a>
	{:else}
		<span class="inline-block font-mono text-xs text-slate-400 {klass}">{value}</span>
	{/if}
{/if}
