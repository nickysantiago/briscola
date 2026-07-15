<script lang="ts">
	import { game, leaveMultiplayer } from '$lib/game.svelte';

	const isMulti = $derived(game.view?.mode === 'multi');
	const over = $derived(!!game.view && (!game.view.gameActive || game.view.gameOver !== null));

	// Solo: jump straight into another game. Live multiplayer: back to the
	// title with the seat token kept, so the game stays resumable. Finished
	// multiplayer: leave for real — the token is dropped so it cannot hijack
	// the next boot over a newer solo game.
	function onclick() {
		if (!isMulti) {
			game.screen = 'difficulty';
		} else if (over) {
			leaveMultiplayer();
		} else {
			game.screen = 'title';
		}
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
