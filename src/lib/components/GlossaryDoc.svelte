<script lang="ts">
	/**
	 * Inline glossary tooltip for display + table contexts. Renders an
	 * optional label followed by a small ⓘ button that pops a card with
	 * the slot's MIxS description, example, pattern, and a link to the
	 * full glossary entry.
	 *
	 * The popover uses `position: fixed` (anchored to the ⓘ button's
	 * bounding rect captured at open time) so it escapes `overflow-auto`
	 * ancestors like the batch table's scroll container. Closes on outside
	 * click, Escape, window resize, or any ancestor scroll.
	 */
	import { getSlot } from '$lib/mixs/schema-index';

	interface Props {
		slot: string;
		label?: string;
		iconOnly?: boolean;
		star?: 'required' | 'recommended';
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
	let anchor = $state<{ top: number; left: number } | null>(null);
	let buttonEl = $state<HTMLButtonElement | null>(null);

	function openAt(e: MouseEvent) {
		e.stopPropagation();
		if (open) { open = false; anchor = null; return; }
		const btn = e.currentTarget as HTMLButtonElement;
		const rect = btn.getBoundingClientRect();
		// Popover is 320px wide; shift left if it would run off the right edge
		// of the viewport, and 2px below the icon.
		const desiredLeft = rect.left;
		const viewportW = window.innerWidth;
		const left = Math.min(desiredLeft, viewportW - 336);
		anchor = { top: rect.bottom + 2, left: Math.max(8, left) };
		open = true;
	}
	function close() { open = false; anchor = null; }

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}
	function onOutside(e: MouseEvent) {
		const el = e.target as HTMLElement;
		if (el === buttonEl || buttonEl?.contains(el)) return;
		if (!el.closest?.('.glossary-doc-popover')) close();
	}
	$effect(() => {
		if (!open) return;
		document.addEventListener('mousedown', onOutside);
		document.addEventListener('keydown', onKey);
		window.addEventListener('resize', close);
		// Any scroll (of the page or any scrollable ancestor) invalidates the
		// anchored position, so just dismiss rather than re-compute.
		window.addEventListener('scroll', close, true);
		return () => {
			document.removeEventListener('mousedown', onOutside);
			document.removeEventListener('keydown', onKey);
			window.removeEventListener('resize', close);
			window.removeEventListener('scroll', close, true);
		};
	});
</script>

<span class="inline-flex items-center gap-1 {cls}">
	{#if !iconOnly}<span>{displayLabel}</span>{/if}
	{#if star === 'required'}<span class="text-rose-400" title="Required by MIxS" aria-label="required">*</span>{/if}
	{#if star === 'recommended'}<span class="text-amber-400" title="Recommended by MIxS" aria-label="recommended">*</span>{/if}
	{#if hasDoc}
		<button
			bind:this={buttonEl}
			type="button"
			class="text-slate-500 hover:text-ocean-400 text-xs align-middle leading-none"
			aria-label="Show documentation for {slot}"
			onclick={openAt}
		>&#9432;</button>
	{/if}
</span>

{#if open && anchor && hasDoc}
	<div
		class="glossary-doc-popover fixed z-[60] w-80 p-3 rounded-lg border border-slate-700 bg-slate-900 shadow-xl text-xs text-slate-300 font-normal"
		style="top: {anchor.top}px; left: {anchor.left}px;"
		role="dialog"
	>
		<div class="flex items-baseline justify-between mb-1">
			<code class="text-ocean-400 font-mono">{slot}</code>
			<button
				type="button"
				class="text-slate-500 hover:text-white text-sm leading-none"
				onclick={close}
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
