<script lang="ts">
	import { onMount } from 'svelte';
	import { cardImg, LOADING_FAILSAFE_MS, SUITS, VALUES } from '$lib/constants';
	import { finishLoading, game, getStoredGameId } from '$lib/game.svelte';
	import { connect, emitResume } from '$lib/net';
	import DifficultySelect from '$lib/components/DifficultySelect.svelte';
	import GameBoard from '$lib/components/GameBoard.svelte';
	import TitleScreen from '$lib/components/TitleScreen.svelte';

	onMount(() => {
		connect();

		// Preload all 40 card faces so the first trick doesn't pop in.
		for (const suit of SUITS) {
			for (const value of VALUES) {
				new Image().src = cardImg({ suit, value });
			}
		}

		// Resume a saved game if one exists (refresh / reopened tab). The boot
		// loading screen stays up until the snapshot settles; without a saved
		// game there is nothing to wait for. The failsafe keeps an unreachable
		// backend from stranding the loading screen forever.
		const storedGameId = getStoredGameId();
		if (storedGameId) {
			emitResume(storedGameId);
			setTimeout(finishLoading, LOADING_FAILSAFE_MS);
		} else {
			finishLoading();
		}
	});
</script>

{#if game.screen === 'title'}
	<TitleScreen />
{:else if game.screen === 'difficulty'}
	<DifficultySelect />
{:else}
	<GameBoard />
{/if}
