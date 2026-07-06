<script lang="ts">
	import { game } from '$lib/game.svelte';

	// The human acts when they lead, or when the AI has led and awaits a response.
	const playersTurn = $derived(
		!!game.view && (game.view.playerLeads || game.table.aiCard !== null)
	);
</script>

{#if game.view?.gameActive}
	<div
		class="rounded-full px-4 py-1 text-sm font-extrabold text-white sm:text-base
			{playersTurn ? 'bg-leaf animate-pulse-green' : 'bg-sky animate-pulse-blue'}"
	>
		{playersTurn ? 'Your turn!' : "AI's turn…"}
	</div>
{/if}
