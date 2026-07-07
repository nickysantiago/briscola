<script lang="ts">
	import { backOut } from 'svelte/easing';
	import { scale } from 'svelte/transition';
	import { game } from '$lib/game.svelte';

	const isMulti = $derived(game.view?.mode === 'multi');
	const oppName = $derived(game.view?.names?.opponent ?? 'AI');

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
		<p class="text-ink/60 text-sm font-semibold">
			{#if isMulti}
				Head <strong>home</strong> to play again!
			{:else}
				Hit <strong>New Game</strong> to play again!
			{/if}
		</p>
	</div>
{/if}
