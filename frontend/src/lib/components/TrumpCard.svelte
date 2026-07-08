<script lang="ts">
	import { game } from '$lib/game.svelte';
	import CardView from './CardView.svelte';
</script>

<div class="flex flex-col items-center gap-1">
	<span class="text-ink/60 text-xs font-extrabold tracking-wide uppercase">Trump</span>
	{#if game.view?.trumpCard}
		<CardView card={game.view.trumpCard} isTrump dimmed={game.view.trumpTaken} />
	{:else}
		<div
			class="rounded-card border-ink/20 text-ink/40 flex h-(--card-h) w-(--card-w) items-center
				justify-center border-4 border-dashed p-1 text-center text-xs font-bold"
		>
			No trump card
		</div>
	{/if}
</div>
