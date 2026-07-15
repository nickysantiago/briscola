<script lang="ts">
	import { game } from '$lib/game.svelte';

	const difficultyChip = {
		easy: 'bg-leaf',
		normal: 'bg-sky',
		hard: 'bg-pop'
	} as const;

	const isMulti = $derived(game.view?.mode === 'multi');
	const myName = $derived(game.view?.names?.me ?? 'You');
	const oppName = $derived(game.view?.names?.opponent ?? 'AI');
</script>

{#if game.view}
	<div class="flex flex-wrap items-center justify-center gap-1.5 text-xs font-bold sm:gap-2 sm:text-sm">
		<span class="rounded-full bg-white/80 px-3 py-1 shadow-chunky-sm ring-1 ring-black/5">
			🙂 {myName} <span class="text-leaf-dark">{game.view.playerPoints}</span>
		</span>
		<span class="rounded-full bg-white/80 px-3 py-1 shadow-chunky-sm ring-1 ring-black/5">
			{isMulti ? '🧑' : '🤖'} {oppName} <span class="text-sky-dark">{game.view.aiPoints}</span>
		</span>
		<span class="rounded-full bg-white/80 px-3 py-1 shadow-chunky-sm ring-1 ring-black/5">
			🂠 Deck {game.view.deckCount}
		</span>
		<span class="rounded-full bg-white/80 px-3 py-1 shadow-chunky-sm ring-1 ring-black/5">
			✋ {isMulti ? `${oppName}'s cards` : 'AI cards'} {game.view.aiHandCount}
		</span>
		{#if game.view.difficulty}
			<span
				class="rounded-full px-3 py-1 text-white capitalize shadow-chunky-sm {difficultyChip[
					game.view.difficulty
				]}"
			>
				{game.view.difficulty}
			</span>
		{:else}
			<span class="bg-grape rounded-full px-3 py-1 text-white shadow-chunky-sm">Multiplayer</span>
		{/if}
	</div>
{/if}
