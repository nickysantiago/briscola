<script lang="ts">
	import { onMount } from 'svelte';
	import { cardImg, LOADING_FAILSAFE_MS, SUITS, VALUES } from '$lib/constants';
	import { finishLoading, game, getStoredGameId, getStoredMpToken } from '$lib/game.svelte';
	import { connect, emitReconnectMultiplayerGame, emitResume } from '$lib/net';
	import DifficultySelect from '$lib/components/DifficultySelect.svelte';
	import GameBoard from '$lib/components/GameBoard.svelte';
	import MpJoin from '$lib/components/MpJoin.svelte';
	import MpStart from '$lib/components/MpStart.svelte';
	import MpWaiting from '$lib/components/MpWaiting.svelte';
	import MultiplayerMenu from '$lib/components/MultiplayerMenu.svelte';
	import TerminatedPanel from '$lib/components/TerminatedPanel.svelte';
	import TitleScreen from '$lib/components/TitleScreen.svelte';

	onMount(() => {
		connect();

		// Preload all 40 card faces so the first trick doesn't pop in.
		for (const suit of SUITS) {
			for (const value of VALUES) {
				new Image().src = cardImg({ suit, value });
			}
		}

		// Resume a saved session if one exists (refresh / reopened tab): a
		// multiplayer seat token wins over a solo gameId. The boot loading screen
		// stays up until the snapshot settles; without a saved session there is
		// nothing to wait for. The failsafe keeps an unreachable backend from
		// stranding the loading screen forever.
		const mpToken = getStoredMpToken();
		const storedGameId = getStoredGameId();
		if (mpToken) {
			emitReconnectMultiplayerGame(mpToken);
			setTimeout(finishLoading, LOADING_FAILSAFE_MS);
		} else if (storedGameId) {
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
{:else if game.screen === 'mpMenu'}
	<MultiplayerMenu />
{:else if game.screen === 'mpStart'}
	<MpStart />
{:else if game.screen === 'mpJoin'}
	<MpJoin />
{:else if game.screen === 'mpWaiting'}
	<MpWaiting />
{:else}
	<GameBoard />
{/if}

<TerminatedPanel />
