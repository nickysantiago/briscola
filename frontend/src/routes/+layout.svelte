<script lang="ts">
	import '@fontsource-variable/baloo-2';
	import '../app.css';
	import FooterBar from '$lib/components/FooterBar.svelte';

	let { children } = $props();
</script>

<div class="flex h-dvh flex-col overflow-hidden">
	<header class="shrink-0 pt-2 pb-1 text-center sm:pt-3">
		<h1
			class="animate-wiggle inline-block text-3xl font-extrabold tracking-wide text-grape drop-shadow-[2px_2px_0_rgb(0_0_0/0.1)] sm:text-4xl"
		>
			<span class="text-pop">B</span><span class="text-sky">r</span><span class="text-leaf">i</span><span
				class="text-sun-dark">s</span
			><span class="text-mint">c</span><span class="text-grape">a</span>
		</h1>
	</header>

	<main class="relative min-h-0 flex-1">
		{@render children()}
	</main>

	<FooterBar />
</div>
