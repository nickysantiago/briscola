<script lang="ts">
	import { backOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { game, startLoading } from '$lib/game.svelte';
	import { emitJoinMultiplayerGame } from '$lib/net';

	let code = $state('');
	let name = $state('');
	const valid = $derived(/^\d{4}$/.test(code) && name.trim().length >= 1 && name.trim().length <= 16);

	function join(e: SubmitEvent) {
		e.preventDefault();
		if (!valid) return;
		game.mp.formError = null;
		startLoading();
		emitJoinMultiplayerGame(code, name.trim());
		// On success the first snapshot settles straight into the game board.
	}
</script>

<div class="flex h-full flex-col items-center justify-center gap-6 px-4 text-center">
	<h2
		class="text-grape text-3xl font-extrabold sm:text-4xl"
		in:fly|global={{ y: -20, duration: 400, easing: backOut }}
	>
		Join a game
	</h2>

	<form
		class="flex w-full max-w-sm flex-col items-center gap-4"
		in:fly|global={{ y: 30, duration: 450, delay: 120, easing: backOut }}
		onsubmit={join}
	>
		<label class="flex w-full flex-col gap-1 text-left">
			<span class="text-ink/70 text-sm font-extrabold uppercase">Room code</span>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="rounded-blob shadow-chunky-sm w-full bg-white/90 px-5 py-3 text-center text-3xl
					font-extrabold tracking-[0.5em] ring-2 ring-black/10 outline-none focus:ring-sky"
				type="text"
				inputmode="numeric"
				pattern="[0-9]*"
				maxlength="4"
				placeholder="0000"
				autofocus
				bind:value={code}
			/>
		</label>

		<label class="flex w-full flex-col gap-1 text-left">
			<span class="text-ink/70 text-sm font-extrabold uppercase">Your name</span>
			<input
				class="rounded-blob shadow-chunky-sm w-full bg-white/90 px-5 py-3 text-lg font-bold
					ring-2 ring-black/10 outline-none focus:ring-sky"
				type="text"
				maxlength="16"
				placeholder="e.g. Beto"
				bind:value={name}
			/>
		</label>

		{#if game.mp.formError}
			<p class="text-pop-dark text-sm font-bold">{game.mp.formError}</p>
		{/if}

		<button
			type="submit"
			class="btn-chunky bg-sky border-sky-dark px-10 py-4 text-2xl disabled:opacity-50"
			disabled={!valid}
		>
			Join Game
		</button>
	</form>

	<button
		class="text-ink/60 hover:text-ink text-base font-bold underline"
		onclick={() => (game.screen = 'mpMenu')}
	>
		← Back
	</button>
</div>
