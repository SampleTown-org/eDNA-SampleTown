<script lang="ts">
	/**
	 * Visualizes MIxS completeness for a sample form:
	 * how many required slots (per the active checklist+extension) have values,
	 * and which slots are still missing.
	 *
	 * Data-only: the caller supplies the required-slot set and current form
	 * values; this component doesn't know about the DB or API.
	 */
	import { getSlot } from '$lib/mixs/schema-index';

	interface Props {
		checklist: string;
		extension: string | null;
		requiredSlots: Set<string>;
		values: Record<string, unknown>;
		/** Slots represented by inputs in the form (so we can flag ones that AREN'T). */
		formSlots?: Set<string>;
	}
	let { checklist, extension, requiredSlots, values, formSlots }: Props = $props();

	let filled = $derived(
		Array.from(requiredSlots).filter((s) => isPresent(values[s]))
	);
	let missing = $derived(
		Array.from(requiredSlots).filter((s) => !isPresent(values[s]))
	);
	let totalRequired = $derived(requiredSlots.size);
	let pct = $derived(totalRequired > 0 ? Math.round((filled.length / totalRequired) * 100) : 100);

	/** Required slots that the form doesn't render at all (need custom_fields or manual entry). */
	let unrepresented = $derived(
		formSlots ? Array.from(requiredSlots).filter((s) => !formSlots.has(s)) : []
	);

	function isPresent(v: unknown): boolean {
		return v !== null && v !== undefined && v !== '';
	}

	function slotTitle(name: string): string {
		return getSlot(name)?.title ?? name;
	}

	let color = $derived(pct === 100 ? 'emerald' : pct >= 66 ? 'amber' : 'rose');
</script>

<div class="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
	<div class="flex items-baseline justify-between mb-2">
		<div class="text-xs text-slate-400">
			MIxS compliance: <span class="text-slate-300 font-medium">{checklist}{extension ? ` + ${extension}` : ''}</span>
		</div>
		<div class="text-xs">
			<span class="font-semibold text-{color}-400">{filled.length}/{totalRequired}</span>
			<span class="text-slate-500"> required slots filled</span>
		</div>
	</div>

	<div class="h-1.5 bg-slate-800 rounded-full overflow-hidden">
		<div class="h-full bg-{color}-500 transition-all" style="width: {pct}%"></div>
	</div>

	{#if missing.length > 0}
		<details class="mt-2">
			<summary class="text-xs text-slate-500 cursor-pointer hover:text-slate-300">
				{missing.length} missing — click to list
			</summary>
			<ul class="mt-1.5 space-y-0.5 text-xs">
				{#each missing as slot}
					<li class="text-slate-400">
						<code class="text-{color}-400">{slot}</code>
						<span class="text-slate-500"> — {slotTitle(slot)}</span>
						{#if unrepresented.includes(slot)}
							<span class="ml-1 px-1 rounded bg-amber-900/30 text-amber-300 text-[10px]">not on form</span>
						{/if}
					</li>
				{/each}
			</ul>
		</details>
	{/if}
</div>
