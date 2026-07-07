<script lang="ts">
	import { backOut } from 'svelte/easing';
	import { scale } from 'svelte/transition';
	import { game } from '$lib/game.svelte';
	import { emitEndGame } from '$lib/net';

	const oppName = $derived(game.view?.names?.opponent ?? 'Your opponent');

	function endGame() {
		if (game.view) emitEndGame(game.view.gameId);
	}
</script>

<div class="absolute inset-0 z-30 flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
	<div
		in:scale={{ duration: 350, easing: backOut, start: 0.6 }}
		class="rounded-blob shadow-chunky bg-white/95 ring-sky flex max-w-sm flex-col items-center
			gap-3 px-8 py-6 text-center ring-4"
	>
		<span class="text-5xl">📡</span>
		<h2 class="text-sky-dark text-2xl font-extrabold">{oppName} disconnected</h2>
		<p class="text-ink/70 text-base font-semibold">
			They have up to 24 hours to come back. The turn clock is paused while you wait — or you can
			end the game now with no winner.
		</p>
		<div class="mt-2 flex flex-col gap-3 sm:flex-row">
			<button
				class="btn-chunky bg-sky border-sky-dark px-6 py-3 text-lg"
				onclick={() => (game.mp.waitDismissed = true)}
			>
				Wait for them
			</button>
			<button class="btn-chunky bg-pop border-pop-dark px-6 py-3 text-lg" onclick={endGame}>
				End Game
			</button>
		</div>
	</div>
</div>
