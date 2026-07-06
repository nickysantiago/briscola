<script lang="ts">
	let { points }: { points: number } = $props();
</script>

<div
	class="animate-points-pop bg-sun text-ink absolute -top-3 -right-3 z-30 flex h-11 w-11
		items-center justify-center rounded-full text-base font-extrabold shadow-chunky-sm"
>
	+{points}
</div>
