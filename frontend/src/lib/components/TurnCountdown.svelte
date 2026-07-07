<script lang="ts">
	import { game } from '$lib/game.svelte';

	// The deadline is server time; correct with the skew measured off the
	// freshest snapshot rather than trusting a client-only timer.
	let remaining = $state<number | null>(null);

	function compute() {
		const deadline = game.view?.turnDeadline ?? null;
		remaining =
			deadline === null
				? null
				: Math.max(0, Math.ceil((deadline - (Date.now() + game.mp.skewMs)) / 1000));
	}

	$effect(() => {
		compute();
		const id = setInterval(compute, 250);
		return () => clearInterval(id);
	});

	const paused = $derived(
		game.view?.turnDeadline == null && game.mp.opponentDisconnected
	);
</script>

{#if game.view?.mode === 'multi' && game.view.gameActive}
	{#if paused}
		<div class="rounded-full bg-white/80 px-4 py-1 text-sm font-extrabold text-ink/60 shadow-chunky-sm ring-1 ring-black/5 sm:text-base">
			⏸ Clock paused
		</div>
	{:else if remaining !== null}
		<div
			class="rounded-full px-4 py-1 text-sm font-extrabold shadow-chunky-sm ring-1 ring-black/5 sm:text-base
				{remaining <= 10 ? 'bg-pop animate-pulse-cta text-white' : 'bg-white/80 text-ink'}"
		>
			⏱ {remaining}s
		</div>
	{/if}
{/if}
