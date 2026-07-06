<script lang="ts">
	import { backOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { game } from '$lib/game.svelte';

	function go(screen: 'mpStart' | 'mpJoin') {
		game.mp.formError = null;
		game.screen = screen;
	}
</script>

<div class="flex h-full flex-col items-center justify-center gap-8 px-4 text-center">
	<h2
		class="text-grape text-3xl font-extrabold sm:text-4xl"
		in:fly|global={{ y: -20, duration: 400, easing: backOut }}
	>
		Play with a friend
	</h2>

	<div class="flex w-full max-w-2xl flex-col justify-center gap-4 sm:flex-row">
		<button
			in:fly|global={{ y: 30, duration: 450, delay: 100, easing: backOut }}
			class="btn-chunky bg-grape border-grape-dark flex-1 px-8 py-5"
			onclick={() => go('mpStart')}
		>
			<span class="block text-2xl">Start Multiplayer Game</span>
			<span class="block text-sm font-semibold opacity-90">Get a room code to share</span>
		</button>
		<button
			in:fly|global={{ y: 30, duration: 450, delay: 220, easing: backOut }}
			class="btn-chunky bg-sky border-sky-dark flex-1 px-8 py-5"
			onclick={() => go('mpJoin')}
		>
			<span class="block text-2xl">Join Multiplayer Game</span>
			<span class="block text-sm font-semibold opacity-90">Enter a friend's code</span>
		</button>
	</div>

	<button
		class="text-ink/60 hover:text-ink text-base font-bold underline"
		in:fly|global={{ y: 20, duration: 400, delay: 340, easing: backOut }}
		onclick={() => (game.screen = 'title')}
	>
		← Back
	</button>
</div>
