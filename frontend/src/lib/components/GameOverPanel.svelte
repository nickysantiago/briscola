<script lang="ts">
	import { backOut } from 'svelte/easing';
	import { scale } from 'svelte/transition';
	import { game, leaveMultiplayer } from '$lib/game.svelte';
	import { emitRequestRematch } from '$lib/net';

	const isMulti = $derived(game.view?.mode === 'multi');
	const oppName = $derived(game.view?.names?.opponent ?? 'AI');
	const iVoted = $derived(!!game.view?.rematch?.me);
	const oppVoted = $derived(!!game.view?.rematch?.opponent);

	function playAgain() {
		if (game.view) emitRequestRematch(game.view.gameId);
	}

	// The server sends a gameOver object; fall back to deriving from points for
	// resumed finished games, just in case.
	const result = $derived.by(() => {
		const v = game.view;
		if (!v) return null;
		if (v.gameOver) return v.gameOver;
		if (v.gameActive) return null;
		const winner: 'player' | 'ai' | 'tie' =
			v.playerPoints > v.aiPoints ? 'player' : v.aiPoints > v.playerPoints ? 'ai' : 'tie';
		return { winner, playerPoints: v.playerPoints, aiPoints: v.aiPoints, difficulty: v.difficulty };
	});

	const looks = $derived({
		player: { emoji: '🎉', title: 'You win!', panel: 'bg-leaf/15 ring-leaf', text: 'text-leaf-dark' },
		ai: {
			emoji: '😢',
			title: `${oppName} wins`,
			panel: 'bg-pop/15 ring-pop',
			text: 'text-pop-dark'
		},
		tie: { emoji: '🤝', title: "It's a tie!", panel: 'bg-sky/15 ring-sky', text: 'text-sky-dark' }
	} as const);
</script>

{#if result}
	{@const look = looks[result.winner]}
	<div
		in:scale|global={{ duration: 450, easing: backOut, start: 0.6 }}
		class="rounded-blob flex flex-col items-center gap-2 px-8 py-6 text-center shadow-chunky
			ring-4 backdrop-blur-sm {look.panel}"
	>
		<span class="text-5xl">{look.emoji}</span>
		<h2 class="text-3xl font-extrabold {look.text}">{look.title}</h2>
		<p class="text-ink text-xl font-bold">
			You {result.playerPoints} — {result.aiPoints} {oppName}
		</p>
		<span class="text-ink/60 text-sm font-bold capitalize">
			{result.difficulty ?? 'multiplayer'} mode
		</span>
		{#if isMulti}
			{#if oppVoted && !iVoted}
				<p class="text-grape text-base font-extrabold">{oppName} wants a rematch!</p>
			{/if}
			<div class="mt-1 flex flex-col items-center gap-3 sm:flex-row">
				{#if iVoted}
					<div class="rounded-full bg-white/80 px-5 py-2 text-base font-extrabold text-ink/60 shadow-chunky-sm ring-1 ring-black/5">
						Waiting for {oppName}…
					</div>
				{:else}
					<button class="btn-chunky bg-leaf border-leaf-dark px-6 py-3 text-lg" onclick={playAgain}>
						Play Again
					</button>
				{/if}
				<button class="btn-chunky bg-pop border-pop-dark px-6 py-3 text-lg" onclick={leaveMultiplayer}>
					Leave
				</button>
			</div>
		{:else}
			<p class="text-ink/60 text-sm font-semibold">
				Hit <strong>New Game</strong> to play again!
			</p>
		{/if}
	</div>
{/if}
