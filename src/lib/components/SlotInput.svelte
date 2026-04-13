<script lang="ts">
	/**
	 * Labeled input for a MIxS slot (or SampleTown-local column).
	 * Pairs <FieldLabel> (with glossary popover + required asterisk) with the
	 * appropriate input type. Deduplicates ~20 copies of the same input+label
	 * pattern previously scattered across the sample forms.
	 */
	import FieldLabel from './FieldLabel.svelte';

	interface Props {
		slot: string;
		type: 'text' | 'number' | 'date' | 'select' | 'textarea';
		value: unknown;
		unit?: string;
		placeholder?: string;
		required?: boolean;
		recommended?: boolean;
		/** Options for select type. Each item `{value, label}`. */
		options?: { value: string; label: string }[];
		/** Optional override label — falls back to slot.title via FieldLabel. */
		label?: string;
		colSpan?: 1 | 2;
	}
	let {
		slot,
		type,
		value = $bindable(),
		unit,
		placeholder,
		required = false,
		recommended = false,
		options = [],
		label,
		colSpan = 1
	}: Props = $props();

	const inputCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-ocean-500';
	const selectCls = 'w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-ocean-500';
</script>

<div class={colSpan === 2 ? 'sm:col-span-2' : ''}>
	<FieldLabel
		{slot}
		{label}
		{required}
		{recommended}
		suffix={unit ? `(${unit})` : ''}
		for={slot}
	/>
	{#if type === 'select'}
		<select id={slot} bind:value class={selectCls}>
			<option value="">Select...</option>
			{#each options as opt}
				<option value={opt.value}>{opt.label}</option>
			{/each}
		</select>
	{:else if type === 'textarea'}
		<textarea id={slot} bind:value rows="2" class={inputCls} {placeholder}></textarea>
	{:else if type === 'number'}
		<input id={slot} type="number" step="any" bind:value class={inputCls} {placeholder} />
	{:else if type === 'date'}
		<input id={slot} type="date" bind:value class={inputCls} />
	{:else}
		<input id={slot} type="text" bind:value class={inputCls} {placeholder} />
	{/if}
</div>
