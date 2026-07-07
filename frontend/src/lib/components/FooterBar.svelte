<script lang="ts">
	import { game } from '$lib/game.svelte';

	const isMulti = $derived(game.view?.mode === 'multi');

	// Solo: jump straight into another game. Multiplayer: back to the title —
	// the seat token keeps the game resumable, and a finished game just closes.
	function onclick() {
		game.screen = isMulti ? 'title' : 'difficulty';
	}
</script>

{#if game.screen === 'game'}
	<footer class="shrink-0 pt-1 pb-3 text-center">
		<button
			class="btn-chunky bg-pop border-pop-dark px-8 py-2.5 text-lg
				{game.view?.gameOver ? 'animate-pulse-cta' : ''}"
			{onclick}
		>
			{isMulti ? 'Leave Game' : 'New Game'}
		</button>
	</footer>
{/if}
