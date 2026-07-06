<script lang="ts">
	import { fade } from 'svelte/transition';
	import { game } from '$lib/game.svelte';

	// Same rainbow palette as the "Brisca" header wordmark.
	const palette = ['text-pop', 'text-sky', 'text-leaf', 'text-sun-dark', 'text-mint', 'text-grape'];
	const letters = [...'Loading...'].map((ch, i) => ({ ch, color: palette[i % palette.length] }));
</script>

{#if game.loading}
	<div
		id="loading-screen"
		transition:fade={{ duration: 300 }}
		class="bg-table fixed inset-0 z-100 flex items-center justify-center"
	>
		<h2
			class="text-4xl font-extrabold tracking-wide drop-shadow-[2px_2px_0_rgb(0_0_0/0.1)] sm:text-5xl"
			aria-label="Loading"
		>
			{#each letters as { ch, color }, i (i)}
				<span class="animate-letter-bounce inline-block {color}" style="animation-delay: {i * 90}ms"
					>{ch}</span
				>
			{/each}
		</h2>
	</div>
{/if}
