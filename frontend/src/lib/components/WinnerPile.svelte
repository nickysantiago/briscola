<script lang="ts">
	import { cardKey, cardTilt } from '$lib/constants';
	import { game } from '$lib/game.svelte';
	import { receive } from '$lib/transitions';
	import CardView from './CardView.svelte';
	import PointsPopup from './PointsPopup.svelte';

	let { who }: { who: 'player' | 'ai' } = $props();

	const cards = $derived(
		who === 'player' ? (game.view?.playerWonCards ?? []) : (game.view?.aiWonCards ?? [])
	);
</script>

<div class="relative flex flex-col items-center gap-1">
	<span class="text-ink/60 text-xs font-extrabold tracking-wide uppercase">
		{who === 'player' ? 'Your wins' : "AI's wins"}
	</span>

	<div class="relative h-[66px] w-[44px]">
		{#if cards.length === 0}
			<div class="rounded-card border-ink/15 absolute inset-0 border-3 border-dashed"></div>
		{/if}
		{#each cards as card, i (cardKey(card))}
			<div
				class="absolute inset-0"
				style="z-index: {i + 1}"
				in:receive={{ key: cardKey(card) }}
			>
				<div style="transform: rotate({cardTilt(card, 16)}deg) translate({(i % 4)}px, {-(i % 3)}px)">
					<CardView {card} size="mini" />
				</div>
			</div>
		{/each}
	</div>

	{#if game.trick && game.trick.winner === who}
		<PointsPopup points={game.trick.points} />
	{/if}
</div>
