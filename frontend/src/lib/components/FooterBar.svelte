<script lang="ts">
	import { game } from '$lib/game.svelte';
</script>

{#if game.screen === 'game'}
	<footer class="shrink-0 pt-1 pb-3 text-center">
		<button
			class="btn-chunky bg-pop border-pop-dark px-8 py-2.5 text-lg
				{game.view?.gameOver ? 'animate-pulse-cta' : ''}"
			onclick={() => (game.screen = 'difficulty')}
		>
			New Game
		</button>
	</footer>
{/if}
