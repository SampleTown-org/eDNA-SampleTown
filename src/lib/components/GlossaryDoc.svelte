<script lang="ts">
	/**
	 * Inline glossary tooltip for display + table contexts. Renders a label
	 * (or nothing if `showLabel={false}`) followed by a small ⓘ button that
	 * pops a card with the slot's MIxS description, example, pattern, and a
	 * link to the full glossary entry. Used instead of opening `/glossary` in
	 * a new tab so users can skim documentation without leaving the page.
	 *
	 * Closes on outside click / Escape. Safe in table cells (positions the
	 * popover with `position: absolute` off a wrapping span).
	 */
	import { getSlot } from '$lib/mixs/schema-index';

	interface Props {
		/** MIxS slot name, or a SampleTown-local key (no popover if no MIxS meta). */
		slot: string;
		/** Override display text; defaults to the slot's MIxS title. */
		label?: string;
		/** Render just the ⓘ icon (no leading label text) — handy when the
		 *  caller already shows the label separately. */
		iconOnly?: boolean;
		/** Show a red ★ (required) or amber ★ (recommended) before the icon. */
		star?: 'required' | 'recommended';
		/** Extra description — shown in the popover alongside the MIxS text. */
		description?: string;
		class?: string;
	}
	let {
		slot,
		label,
		iconOnly = false,
		star,
		description,
		class: cls = ''
	}: Props = $props();

	const meta = $derived(getSlot(slot));
	const displayLabel = $derived(label ?? meta?.title ?? slot);
	const hasDoc = $derived(Boolean(meta) || Boolean(description));
	let open = $state(false);

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') open = false;
	}
	function onOutside(e: MouseEvent) {
		const el = e.target as HTMLElement;
		if (!el.closest?.('.glossary-doc-pop')) open = false;
	}
	$effect(() => {
		if (open) {
			document.addEventListener('click', onOutside);
			document.addEventListener('keydown', onKey);
			return () => {
				document.removeEventListener('click', onOutside);
				document.removeEventListener('keydown', onKey);
			};
		}
	});
</script>

<span class="glossary-doc-pop relative inline-flex items-center gap-1 {cls}">
	{#if !iconOnly}<span>{displayLabel}</span>{/if}
	{#if star === 'required'}<span class="text-rose-400" title="Required by MIxS" aria-label="required">*</span>{/if}
	{#if star === 'recommended'}<span class="text-amber-400" title="Recommended by MIxS" aria-label="recommended">*</span>{/if}
	{#if hasDoc}
		<button
			type="button"
			class="text-slate-500 hover:text-ocean-400 text-xs align-middle leading-none"
			aria-label="Show documentation for {slot}"
			onclick={(e) => { e.stopPropagation(); open = !open; }}
		>&#9432;</button>
		{#if open}
			<div
				class="glossary-doc-pop absolute left-0 top-full mt-1 z-50 w-80 p-3 rounded-lg border border-slate-700 bg-slate-900 shadow-xl text-xs text-slate-300 font-normal"
				role="dialog"
			>
				<div class="flex items-baseline justify-between mb-1">
					<code class="text-ocean-400 font-mono">{slot}</code>
					<button
						type="button"
						class="text-slate-500 hover:text-white text-sm leading-none"
						onclick={(e) => { e.stopPropagation(); open = false; }}
						aria-label="Close"
					>&times;</button>
				</div>
				{#if description}
					<p class="text-slate-300 leading-snug">{description}</p>
				{:else if meta?.description}
					<p class="text-slate-300 leading-snug">{meta.description}</p>
				{/if}
				{#if meta?.examples && meta.examples.length > 0}
					<div class="mt-2">
						<span class="text-slate-500">Example: </span>
						<code class="text-slate-200">{meta.examples[0]}</code>
					</div>
				{/if}
				{#if meta?.structured_pattern || meta?.pattern}
					<div class="mt-1 text-slate-500">
						Pattern: <code class="text-slate-400">{meta.structured_pattern ?? meta.pattern}</code>
					</div>
				{/if}
				{#if meta}
					<div class="mt-2 text-[11px]">
						<a
							href="/glossary#{slot}"
							class="text-ocean-400 hover:text-ocean-300"
							target="_blank"
							rel="noopener"
						>Open in glossary &rarr;</a>
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</span>
