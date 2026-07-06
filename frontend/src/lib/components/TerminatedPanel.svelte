<script lang="ts">
	import { backOut } from 'svelte/easing';
	import { scale } from 'svelte/transition';
	import { game } from '$lib/game.svelte';

	const copy = {
		youEnded: {
			emoji: '🚪',
			title: 'Game ended',
			body: 'You ended the game. No winner was recorded.'
		},
		opponentEnded: {
			emoji: '🚪',
			title: 'Game ended',
			body: 'Your opponent ended the game. No winner was recorded.'
		},
		expired: {
			emoji: '⏳',
			title: 'Game expired',
			body: 'The game was abandoned for 24 hours and has been closed. No winner was recorded.'
		}
	} as const;

	const look = $derived(game.mp.terminated ? copy[game.mp.terminated] : null);
</script>

{#if look}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px] px-4">
		<div
			in:scale={{ duration: 400, easing: backOut, start: 0.6 }}
			class="rounded-blob shadow-chunky bg-white/95 ring-grape flex max-w-sm flex-col items-center
				gap-3 px-8 py-6 text-center ring-4"
		>
			<span class="text-5xl">{look.emoji}</span>
			<h2 class="text-grape text-2xl font-extrabold">{look.title}</h2>
			<p class="text-ink/70 text-base font-semibold">{look.body}</p>
			<button
				class="btn-chunky bg-grape border-grape-dark mt-2 px-8 py-3 text-lg"
				onclick={() => (game.mp.terminated = null)}
			>
				Back to menu
			</button>
		</div>
	</div>
{/if}
