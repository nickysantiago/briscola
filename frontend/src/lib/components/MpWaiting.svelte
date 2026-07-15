<script lang="ts">
	import { backOut } from 'svelte/easing';
	import { fly, scale } from 'svelte/transition';
	import { clearStoredMpToken, game, resetMp } from '$lib/game.svelte';

	// Abandon the lobby: drop the token and go home. The unjoined lobby itself
	// idles out server-side after an hour.
	function cancel() {
		clearStoredMpToken();
		resetMp();
		game.screen = 'title';
	}
</script>

<div class="flex h-full flex-col items-center justify-center gap-6 px-4 text-center">
	<h2
		class="text-grape text-3xl font-extrabold sm:text-4xl"
		in:fly|global={{ y: -20, duration: 400, easing: backOut }}
	>
		Your room is ready!
	</h2>

	<div
		class="rounded-blob shadow-chunky bg-white/90 px-10 py-6 ring-4 ring-grape/40"
		in:scale|global={{ duration: 450, easing: backOut, start: 0.6 }}
	>
		<p class="text-ink/60 text-sm font-extrabold uppercase">Room code</p>
		<p class="text-grape text-6xl font-extrabold tracking-[0.3em] sm:text-7xl">
			{game.mp.code ?? '····'}
		</p>
	</div>

	<p
		class="text-ink/70 text-lg font-semibold"
		in:fly|global={{ y: 20, duration: 400, delay: 200, easing: backOut }}
	>
		Share this code with a friend, then sit tight.
	</p>

	<div
		class="bg-sky animate-pulse-blue rounded-full px-5 py-2 text-base font-extrabold text-white"
		in:fly|global={{ y: 20, duration: 400, delay: 300, easing: backOut }}
	>
		Waiting for an opponent…
	</div>

	<button class="text-ink/60 hover:text-ink text-base font-bold underline" onclick={cancel}>
		Cancel
	</button>
</div>
