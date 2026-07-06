<script lang="ts">
	import { backOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { game, getStoredGameId, startLoading } from '$lib/game.svelte';
	import { emitResume } from '$lib/net';
	import CardView from './CardView.svelte';
	import type { Card } from '$lib/types';

	// Decorative fan of real card art.
	const fan: { card: Card; tilt: number }[] = [
		{ card: { suit: 'Oros', value: 1 }, tilt: -14 },
		{ card: { suit: 'Copas', value: 3 }, tilt: 0 },
		{ card: { suit: 'Espadas', value: 12 }, tilt: 14 }
	];

	// An unfinished game can be resumed: the last settled snapshot is still
	// active (the user came here via the home button, or a finished game shows
	// Start only).
	const canResume = $derived(!!game.view?.gameActive);

	function resumeGame() {
		const gameId = getStoredGameId();
		if (!gameId) return;
		startLoading();
		emitResume(gameId);
	}
</script>

<div class="flex h-full flex-col items-center justify-center gap-6 px-4 text-center">
	<div
		class="flex items-end justify-center"
		in:fly|global={{ y: -30, duration: 600, easing: backOut }}
	>
		{#each fan as { card, tilt }, i (i)}
			<div
				class="-mx-3 transition-transform duration-300 hover:-translate-y-2"
				style="transform: rotate({tilt}deg); z-index: {i === 1 ? 2 : 1}"
			>
				<CardView {card} />
			</div>
		{/each}
	</div>

	<div in:fly|global={{ y: 20, duration: 500, delay: 150, easing: backOut }}>
		<h2 class="text-grape text-3xl font-extrabold sm:text-4xl">Welcome to Brisca!</h2>
		<p class="text-ink/70 mt-1 text-lg font-semibold">A traditional Spanish card game</p>
	</div>

	<div
		class="flex flex-col items-center justify-center gap-4 sm:flex-row"
		in:fly|global={{ y: 20, duration: 500, delay: 300, easing: backOut }}
	>
		<button
			class="btn-chunky bg-grape border-grape-dark px-10 py-4 text-2xl"
			onclick={() => (game.screen = 'difficulty')}
		>
			Start Game
		</button>
		{#if canResume}
			<button class="btn-chunky bg-mint border-mint-dark px-10 py-4 text-2xl" onclick={resumeGame}>
				Resume Game
			</button>
		{/if}
	</div>
</div>
