<script lang="ts">
	import { backOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { game } from '$lib/game.svelte';
	import CardView from './CardView.svelte';
	import type { Card } from '$lib/types';

	// Decorative fan of real card art.
	const fan: { card: Card; tilt: number }[] = [
		{ card: { suit: 'Oros', value: 1 }, tilt: -14 },
		{ card: { suit: 'Copas', value: 3 }, tilt: 0 },
		{ card: { suit: 'Espadas', value: 12 }, tilt: 14 }
	];
</script>

<div class="flex h-full flex-col items-center justify-center gap-6 px-4 text-center">
	<div class="flex items-end justify-center" in:fly={{ y: -30, duration: 600, easing: backOut }}>
		{#each fan as { card, tilt }, i (i)}
			<div
				class="-mx-3 transition-transform duration-300 hover:-translate-y-2"
				style="transform: rotate({tilt}deg); z-index: {i === 1 ? 2 : 1}"
			>
				<CardView {card} />
			</div>
		{/each}
	</div>

	<div in:fly={{ y: 20, duration: 500, delay: 150, easing: backOut }}>
		<h2 class="text-grape text-3xl font-extrabold sm:text-4xl">Welcome to Brisca!</h2>
		<p class="text-ink/70 mt-1 text-lg font-semibold">A traditional Spanish card game</p>
	</div>

	<button
		in:fly={{ y: 20, duration: 500, delay: 300, easing: backOut }}
		class="btn-chunky bg-grape border-grape-dark px-10 py-4 text-2xl"
		onclick={() => (game.screen = 'difficulty')}
	>
		Start Game
	</button>
</div>
