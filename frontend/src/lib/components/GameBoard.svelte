<script lang="ts">
	import { game } from '$lib/game.svelte';
	import GameInfo from './GameInfo.svelte';
	import GameOverPanel from './GameOverPanel.svelte';
	import Hand from './Hand.svelte';
	import PlayArea from './PlayArea.svelte';
	import TrumpCard from './TrumpCard.svelte';
	import TurnIndicator from './TurnIndicator.svelte';
	import WinnerPile from './WinnerPile.svelte';

	const over = $derived(!!game.view && (!game.view.gameActive || game.view.gameOver !== null));
</script>

{#if game.view}
	<div class="flex h-full min-h-0 flex-col">
		<div class="flex shrink-0 flex-col items-center gap-1.5 px-2 pt-1">
			<GameInfo />
			<TurnIndicator />
		</div>

		<div class="relative min-h-0 flex-1">
			<!-- Center: play area, or the game-over panel once the board settles -->
			<div class="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
				<div class="pointer-events-auto">
					{#if over}
						<GameOverPanel />
					{:else}
						<PlayArea />
					{/if}
				</div>
			</div>

			<div class="absolute top-1/2 left-1 -translate-y-1/2 sm:left-4">
				<TrumpCard />
			</div>
			<div class="absolute top-1 right-1 z-20 sm:right-4">
				<WinnerPile who="ai" />
			</div>
			<div class="absolute right-1 bottom-1 z-20 sm:right-4">
				<WinnerPile who="player" />
			</div>
		</div>

		<div class="shrink-0">
			<Hand />
		</div>
	</div>
{/if}
