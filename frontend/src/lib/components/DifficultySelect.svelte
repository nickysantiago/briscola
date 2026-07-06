<script lang="ts">
	import { backOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { game } from '$lib/game.svelte';
	import { emitNewGame } from '$lib/net';
	import type { Difficulty } from '$lib/types';

	const options: { difficulty: Difficulty; label: string; hint: string; classes: string }[] = [
		{ difficulty: 'easy', label: 'Easy', hint: 'Random plays', classes: 'bg-leaf border-leaf-dark' },
		{ difficulty: 'normal', label: 'Normal', hint: 'Strategic plays', classes: 'bg-sky border-sky-dark' },
		{ difficulty: 'hard', label: 'Hard', hint: 'Expert strategy', classes: 'bg-pop border-pop-dark' }
	];

	function startNewGame(difficulty: Difficulty) {
		game.busy = false;
		emitNewGame(difficulty);
		// The board appears when the server's first snapshot settles.
	}
</script>

<div class="flex h-full flex-col items-center justify-center gap-8 px-4 text-center">
	<h2
		class="text-grape text-3xl font-extrabold sm:text-4xl"
		in:fly={{ y: -20, duration: 400, easing: backOut }}
	>
		Pick your challenge
	</h2>

	<div class="flex w-full max-w-2xl flex-col justify-center gap-4 sm:flex-row">
		{#each options as { difficulty, label, hint, classes }, i (difficulty)}
			<button
				in:fly={{ y: 30, duration: 450, delay: 100 + i * 120, easing: backOut }}
				class="btn-chunky {classes} flex-1 px-8 py-5"
				onclick={() => startNewGame(difficulty)}
			>
				<span class="block text-2xl">{label}</span>
				<span class="block text-sm font-semibold opacity-90">{hint}</span>
			</button>
		{/each}
	</div>
</div>
