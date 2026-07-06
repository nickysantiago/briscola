<script lang="ts">
	import { backOut } from 'svelte/easing';
	import { fly, scale } from 'svelte/transition';
	import { cardKey, FLIGHT_MS } from '$lib/constants';
	import { game } from '$lib/game.svelte';
	import { receive, send } from '$lib/transitions';
	import CardView from './CardView.svelte';

	const trumpSuit = $derived(game.view?.trumpCard?.suit ?? null);

	// Single-item keyed each blocks (not #if): a leaving block keeps its old
	// item value during the outro, so out:send still sees the card after the
	// orchestrator nulls the table slot.
	const playerPlayed = $derived(game.table.playerCard ? [game.table.playerCard] : []);
	const aiPlayed = $derived(game.table.aiCard ? [game.table.aiCard] : []);
</script>

<div class="flex flex-col items-center gap-3">
	<div class="flex min-h-(--card-h) items-start justify-center gap-[clamp(15px,4vw,30px)]">
		<!-- Player's played card -->
		<div class="flex flex-col items-center gap-1">
			{#each playerPlayed as card (cardKey(card))}
				<div in:receive={{ key: cardKey(card) }} out:send={{ key: cardKey(card) }}>
					<CardView {card} isTrump={card.suit === trumpSuit} />
				</div>
			{/each}
			{#if game.table.playerCard}
				<span class="text-ink/60 text-xs font-extrabold uppercase">You</span>
			{/if}
		</div>

		<!-- AI's played card: flies in from the top, flies out to the winner pile -->
		<div class="flex flex-col items-center gap-1">
			{#each aiPlayed as card (cardKey(card))}
				<div
					in:fly={{ y: -220, duration: FLIGHT_MS, easing: backOut }}
					out:send={{ key: cardKey(card) }}
				>
					<CardView {card} isTrump={card.suit === trumpSuit} />
				</div>
			{/each}
			{#if game.table.aiCard}
				<span class="text-ink/60 text-xs font-extrabold uppercase">AI</span>
			{/if}
		</div>
	</div>

	<!-- Trick outcome banner -->
	{#if game.trick}
		<div
			in:scale={{ duration: 350, easing: backOut, start: 0.5 }}
			class="rounded-blob px-5 py-2 text-lg font-extrabold text-white shadow-chunky
				{game.trick.winner === 'player' ? 'bg-leaf' : 'bg-sky'}"
		>
			{game.trick.winner === 'player' ? 'You win the trick!' : 'AI wins the trick!'}
			<span class="text-sun">+{game.trick.points}</span>
		</div>
	{/if}
</div>
