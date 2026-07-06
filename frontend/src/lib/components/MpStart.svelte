<script lang="ts">
	import { backOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { game, startLoading } from '$lib/game.svelte';
	import { emitCreateMultiplayerGame } from '$lib/net';

	let name = $state('');
	const valid = $derived(name.trim().length >= 1 && name.trim().length <= 16);

	function create(e: SubmitEvent) {
		e.preventDefault();
		if (!valid) return;
		game.mp.formError = null;
		startLoading();
		emitCreateMultiplayerGame(name.trim());
		// lobbyCreated flips the screen to the waiting room.
	}
</script>

<div class="flex h-full flex-col items-center justify-center gap-6 px-4 text-center">
	<h2
		class="text-grape text-3xl font-extrabold sm:text-4xl"
		in:fly|global={{ y: -20, duration: 400, easing: backOut }}
	>
		Start a game
	</h2>

	<form
		class="flex w-full max-w-sm flex-col items-center gap-4"
		in:fly|global={{ y: 30, duration: 450, delay: 120, easing: backOut }}
		onsubmit={create}
	>
		<label class="flex w-full flex-col gap-1 text-left">
			<span class="text-ink/70 text-sm font-extrabold uppercase">Your name</span>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="rounded-blob shadow-chunky-sm w-full bg-white/90 px-5 py-3 text-lg font-bold
					ring-2 ring-black/10 outline-none focus:ring-grape"
				type="text"
				maxlength="16"
				placeholder="e.g. Ana"
				autofocus
				bind:value={name}
			/>
		</label>

		{#if game.mp.formError}
			<p class="text-pop-dark text-sm font-bold">{game.mp.formError}</p>
		{/if}

		<button
			type="submit"
			class="btn-chunky bg-grape border-grape-dark px-10 py-4 text-2xl disabled:opacity-50"
			disabled={!valid}
		>
			Create Room
		</button>
	</form>

	<button
		class="text-ink/60 hover:text-ink text-base font-bold underline"
		onclick={() => (game.screen = 'mpMenu')}
	>
		← Back
	</button>
</div>
