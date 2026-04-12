<script lang="ts">
	/**
	 * Field label with inline MIxS documentation.
	 *
	 * Wraps an HTML <label> and adds a small (i) button that opens a popover
	 * showing the slot's title, description, examples, pattern, and a link
	 * to the glossary entry. Falls back to a plain label if the slot name
	 * isn't in the active MIxS schema (e.g. SampleTown-local columns like
	 * `collector_name`).
	 */
	import { getSlot } from '$lib/mixs/schema-index';

	interface Props {
		/** MIxS slot name, or a SampleTown-local column name. */
		slot: string;
		/** The HTML `for` attribute; defaults to the slot name. */
		for?: string;
		/** Override display text; defaults to slot.title. */
		label?: string;
		/** Force-show a red `*`. */
		required?: boolean;
		/** Extra inline content after the label text (e.g. `(°C)`). */
		suffix?: string;
		class?: string;
	}
	let { slot, for: forAttr, label, required = false, suffix = '', class: cls = '' }: Props = $props();

	const meta = $derived(getSlot(slot));
	const displayLabel = $derived(label ?? meta?.title ?? slot);
	const hasDoc = $derived(Boolean(meta));
	let open = $state(false);
</script>

<label for={forAttr ?? slot} class="block text-sm font-medium text-slate-300 mb-1 relative {cls}">
	{displayLabel}{#if suffix} {suffix}{/if}{#if required}<span class="text-rose-400 ml-0.5">*</span>{/if}

	{#if hasDoc}
		<button
			type="button"
			class="ml-1 text-slate-500 hover:text-ocean-400 text-xs align-middle"
			aria-label="Show MIxS documentation for {slot}"
			onclick={(e) => { e.preventDefault(); open = !open; }}
		>
			&#9432;
		</button>

		{#if open}
			<!-- Popover — click-outside close -->
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
				{#if meta?.description}
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
			</div>
		{/if}
	{/if}
</label>
