<script lang="ts">
	/**
	 * Read-only display of the people attributed to an entity. Used by detail
	 * pages (samples, extracts, plates, runs) to surface the entity_personnel
	 * rows that PeoplePicker writes — same chip styling as the picker so the
	 * "what you saved is what you see" loop is obvious.
	 *
	 * The role label hashes to a stable HSL background, matching the picker.
	 * Pass `compact` for the list-view variant: smaller chips, no labels.
	 */

	type PersonRow = {
		personnel_id: string;
		full_name: string;
		role: string | null;
		email?: string | null;
		institution?: string | null;
	};

	interface Props {
		people: PersonRow[];
		compact?: boolean;
	}

	let { people, compact = false }: Props = $props();

	function chipStyle(role: string | null | undefined): string {
		if (!role) return '';
		let h = 0;
		for (let i = 0; i < role.length; i++) h = (h * 31 + role.charCodeAt(i)) | 0;
		const hue = Math.abs(h) % 360;
		return `background-color: hsl(${hue}, 30%, 28%);`;
	}

	function chipClass(role: string | null | undefined): string {
		if (!role) return 'bg-slate-700/60 text-slate-300 border-slate-700';
		return 'text-white border-transparent';
	}
</script>

{#if people.length > 0}
	<div class="flex flex-wrap gap-{compact ? '1' : '1.5'}">
		{#each people as p}
			<span
				class="inline-flex items-center gap-1.5 rounded border {chipClass(p.role)} {compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs'}"
				style={chipStyle(p.role)}
				title={p.role ? `${p.full_name} · ${p.role}` : p.full_name}
			>
				<span>{p.full_name}</span>
				{#if p.role && !compact}
					<span class="opacity-70">· {p.role}</span>
				{/if}
			</span>
		{/each}
	</div>
{/if}
