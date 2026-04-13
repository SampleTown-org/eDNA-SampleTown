<script lang="ts">
	/**
	 * Field label with inline documentation popover.
	 *
	 * For MIxS slots, the popover auto-populates from the schema index and
	 * links to /glossary#<slot>. For SampleTown-local fields (project, site,
	 * etc.) the caller can pass a `description` to surface the same popover
	 * with custom text — no glossary link since there's no MIxS entry.
	 *
	 * `required={true}` shows a red `*`; `recommended={true}` shows an amber
	 * `*` (when not required). Those colors match the Required section header
	 * and the Recommended-marker style elsewhere.
	 */
	import { getSlot } from '$lib/mixs/schema-index';

	interface Props {
		/** MIxS slot name, or a SampleTown-local field name. */
		slot: string;
		/** The HTML `for` attribute; defaults to the slot name. */
		for?: string;
		/** Override display text; defaults to slot.title. */
		label?: string;
		/** Custom description — overrides MIxS description or provides one for non-MIxS fields. */
		description?: string;
		/** MIxS-required — red `*`. */
		required?: boolean;
		/** MIxS-recommended — amber `*` (shown only when not also required). */
		recommended?: boolean;
		/** Extra inline content after the label text (e.g. `(°C)`). */
		suffix?: string;
		class?: string;
	}
	let {
		slot,
		for: forAttr,
		label,
		description,
		required = false,
		recommended = false,
		suffix = '',
		class: cls = ''
	}: Props = $props();

	const meta = $derived(getSlot(slot));
	const displayLabel = $derived(label ?? meta?.title ?? slot);
	const effectiveDescription = $derived(description ?? meta?.description);
	const hasDoc = $derived(Boolean(effectiveDescription) || Boolean(meta));
	/** Only link to glossary for real MIxS slots. */
	const hasGlossary = $derived(Boolean(meta));
	let open = $state(false);
</script>

<label for={forAttr ?? slot} class="block text-sm font-medium text-slate-300 mb-1 relative {cls}">
	{displayLabel}{#if suffix} {suffix}{/if}{#if required}<span class="text-rose-400 ml-0.5">*</span>{:else if recommended}<span class="text-amber-400 ml-0.5" title="Recommended by MIxS">*</span>{/if}

	{#if hasDoc}
		<button
			type="button"
			class="ml-1 text-slate-500 hover:text-ocean-400 text-xs align-middle"
			aria-label="Show documentation for {slot}"
			onclick={(e) => { e.preventDefault(); open = !open; }}
		>
			&#9432;
		</button>

		{#if open}
			<div
				class="absolute left-0 mt-1 z-50 w-80 p-3 rounded-lg border border-slate-700 bg-slate-900 shadow-xl text-xs text-slate-300 font-normal"
				role="dialog"
			>
				<div class="flex items-baseline justify-between mb-1">
					<code class="text-ocean-400 font-mono">{slot}</code>
					<button
						type="button"
						class="text-slate-500 hover:text-white text-sm leading-none"
						onclick={(e) => { e.preventDefault(); open = false; }}
						aria-label="Close"
					>&times;</button>
				</div>
				{#if effectiveDescription}
					<p class="text-slate-300 leading-snug">{effectiveDescription}</p>
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
				{#if hasGlossary}
					<div class="mt-2 flex items-center gap-3 text-[11px]">
						<a
							href="/glossary#{slot}"
							class="text-ocean-400 hover:text-ocean-300"
							target="_blank"
							rel="noopener"
						>Open in glossary &rarr;</a>
						{#if meta?.slot_uri}
							<span class="text-slate-500">{meta.slot_uri}</span>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</label>
