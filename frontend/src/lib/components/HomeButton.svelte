<script lang="ts">
	import { backOut } from 'svelte/easing';
	import { scale } from 'svelte/transition';
	import { game, leaveMultiplayer } from '$lib/game.svelte';

	// Leaving a FINISHED multiplayer game abandons the session (token dropped
	// so it cannot hijack the next boot); a live one stays resumable.
	function goHome() {
		const v = game.view;
		if (v?.mode === 'multi' && (!v.gameActive || v.gameOver !== null)) {
			leaveMultiplayer();
		} else {
			game.screen = 'title';
		}
	}
</script>

{#if game.screen !== 'title' && !game.loading}
	<button
		transition:scale={{ duration: 250, easing: backOut, start: 0.5 }}
		aria-label="Back to title screen"
		class="bg-sun border-sun-dark text-ink shadow-chunky fixed right-[15%] bottom-4 z-40 flex
			h-12 w-12 items-center justify-center rounded-full border-b-4 transition-all
			duration-150 ease-out select-none hover:-translate-y-0.5 hover:brightness-105
			active:translate-y-1 active:border-b-2 active:shadow-none landscape:right-[10%]"
		onclick={goHome}
	>
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="h-6 w-6"
			aria-hidden="true"
		>
			<path d="M3 11.5 12 4l9 7.5" />
			<path d="M5.5 10.5V20h13v-9.5" />
		</svg>
	</button>
{/if}
