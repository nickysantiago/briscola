<script lang="ts">
	import { game } from '$lib/game.svelte';

	// Solo: the human acts when they lead, or when the AI has led and awaits a
	// response (derived from the table so the flag flips as the card lands).
	// Multiplayer: the snapshot's seat-relative myTurn is authoritative.
	const playersTurn = $derived(
		!!game.view &&
			(game.view.mode === 'multi'
				? game.view.myTurn
				: game.view.playerLeads || game.table.aiCard !== null)
	);
	const oppName = $derived(game.view?.names?.opponent ?? 'AI');
</script>

{#if game.view?.gameActive}
	<div
		class="rounded-full px-4 py-1 text-sm font-extrabold text-white sm:text-base
			{playersTurn ? 'bg-leaf animate-pulse-green' : 'bg-sky animate-pulse-blue'}"
	>
		{playersTurn ? 'Your turn!' : `${oppName}'s turn…`}
	</div>
{/if}
