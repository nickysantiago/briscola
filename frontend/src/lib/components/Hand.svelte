<script lang="ts">
	import { flip } from 'svelte/animate';
	import { backOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { cardKey } from '$lib/constants';
	import { game } from '$lib/game.svelte';
	import { emitPlayCard } from '$lib/net';
	import { send } from '$lib/transitions';
	import CardView from './CardView.svelte';

	const trumpSuit = $derived(game.view?.trumpCard?.suit ?? null);
	const canPlay = $derived(
		!!game.view &&
			!game.busy &&
			game.view.gameActive &&
			(game.view.playerLeads || game.table.aiCard !== null)
	);

	function play(index: number) {
		// Same guards as the old controller; the server's seq is the authority.
		if (!game.view || game.busy || !game.view.gameActive) return;
		if (!game.view.playerLeads && game.table.aiCard === null) return;
		game.busy = true;
		emitPlayCard(game.view.gameId, index, game.view.seq);
	}
</script>

{#if game.view}
	<div class="flex items-end justify-center gap-2 px-2 pt-3 pb-2 sm:gap-3">
		{#each game.view.playerHand as card, index (cardKey(card))}
			<div
				animate:flip={{ duration: 300 }}
				in:fly={{ y: 30, duration: 450, easing: backOut }}
				out:send={{ key: cardKey(card) }}
			>
				<CardView
					{card}
					clickable={canPlay}
					isTrump={card.suit === trumpSuit}
					onclick={() => play(index)}
				/>
			</div>
		{/each}
	</div>
{/if}
