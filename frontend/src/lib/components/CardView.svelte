<script lang="ts">
	import { cardImg } from '$lib/constants';
	import type { Card } from '$lib/types';

	let {
		card,
		clickable = false,
		isTrump = false,
		dragging = false,
		size = 'normal',
		onclick
	}: {
		card: Card;
		clickable?: boolean;
		isTrump?: boolean;
		/** Being dragged: the wrapper owns the transform, so no hover lift. */
		dragging?: boolean;
		size?: 'normal' | 'mini';
		onclick?: () => void;
	} = $props();
</script>

<svelte:element
	this={clickable ? 'button' : 'div'}
	role={clickable ? 'button' : 'img'}
	{onclick}
	aria-label={`${card.value} of ${card.suit}`}
	class="rounded-card block bg-white bg-cover bg-center
		{size === 'mini' ? 'h-[66px] w-[44px]' : 'h-(--card-h) w-(--card-w)'}
		{isTrump ? 'ring-sun shadow-trump ring-4' : 'shadow-chunky-sm ring-1 ring-black/10'}
		{dragging
		? 'cursor-grabbing shadow-xl'
		: clickable
			? 'cursor-grab transition-transform duration-150 ease-out hover:-translate-y-3 hover:scale-105 hover:rotate-2 active:scale-95'
			: ''}"
	style="background-image: url('{cardImg(card)}')"
></svelte:element>
