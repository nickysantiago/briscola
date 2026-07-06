import { cubicOut } from 'svelte/easing';
import { crossfade } from 'svelte/transition';
import { FLIGHT_MS } from './constants';

/**
 * Shared crossfade pair: a card whose `out:send` and `in:receive` share a key
 * visually flies between the two containers (hand → play area, play area →
 * winner pile). Card keys are unique game-wide, so the pairs never collide.
 */
export const [send, receive] = crossfade({
	duration: FLIGHT_MS,
	easing: cubicOut,
	fallback: (node) => ({
		duration: 300,
		easing: cubicOut,
		css: (t) => `opacity: ${t}; transform: scale(${0.8 + 0.2 * t});`
	})
});
