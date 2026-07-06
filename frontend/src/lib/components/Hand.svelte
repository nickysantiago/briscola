<script lang="ts">
	import { flip } from 'svelte/animate';
	import { backOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { cardKey } from '$lib/constants';
	import { clearDrag, drag } from '$lib/drag.svelte';
	import { game } from '$lib/game.svelte';
	import { emitPlayCard } from '$lib/net';
	import { send } from '$lib/transitions';
	import type { Card } from '$lib/types';
	import CardView from './CardView.svelte';

	const DRAG_THRESHOLD = 8; // px of movement before a press becomes a drag
	const DROP_ZONE_MARGIN = 40; // generous inflation of the play-area hit box
	const SPRING_BACK_MS = 400;

	const trumpSuit = $derived(game.view?.trumpCard?.suit ?? null);
	// Solo: playable when leading or once the AI's lead is on the table.
	// Multiplayer: the snapshot's seat-relative myTurn is authoritative (false
	// while my own led card waits for the opponent).
	const myTurn = $derived(
		!!game.view &&
			(game.view.mode === 'multi'
				? game.view.myTurn
				: game.view.playerLeads || game.table.aiCard !== null)
	);
	const canPlay = $derived(!!game.view && !game.busy && game.view.gameActive && myTurn);

	let pressed: { x: number; y: number; index: number; key: string } | null = null;
	let suppressClick = false;

	function play(index: number): boolean {
		// Same guards as the old controller; the server's seq is the authority.
		if (!canPlay || !game.view) return false;
		game.busy = true;
		emitPlayCard(game.view.gameId, index, game.view.seq);
		return true;
	}

	function onClick(index: number) {
		// A drag that just ended also dispatches a click on the card — eat it.
		if (suppressClick) return;
		play(index);
	}

	function overDropZone(x: number, y: number): boolean {
		const rect = document.getElementById('play-area')?.getBoundingClientRect();
		if (!rect) return false;
		return (
			x >= rect.left - DROP_ZONE_MARGIN &&
			x <= rect.right + DROP_ZONE_MARGIN &&
			y >= rect.top - DROP_ZONE_MARGIN &&
			y <= rect.bottom + DROP_ZONE_MARGIN
		);
	}

	function onDown(e: PointerEvent, index: number, card: Card) {
		suppressClick = false;
		if (!canPlay || drag.returning || !e.isPrimary || e.button !== 0) return;
		pressed = { x: e.clientX, y: e.clientY, index, key: cardKey(card) };
		// Capture on the card button itself: moves keep flowing to us during a
		// fast drag, while a plain click still targets the button.
		(e.target as Element | null)?.setPointerCapture?.(e.pointerId);
	}

	function onMove(e: PointerEvent) {
		if (!pressed) return;
		const dx = e.clientX - pressed.x;
		const dy = e.clientY - pressed.y;
		if (!drag.pointerActive && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
		drag.pointerActive = true;
		drag.key = pressed.key;
		drag.dx = dx;
		drag.dy = dy;
		drag.over = overDropZone(e.clientX, e.clientY);
	}

	function onUp() {
		if (!pressed) return;
		const { index } = pressed;
		pressed = null;
		if (!drag.pointerActive) return; // plain click — the button's click event plays
		drag.pointerActive = false;
		suppressClick = true;
		setTimeout(() => (suppressClick = false), 250);
		if (drag.over && play(index)) {
			// Leave the card frozen at the drop point: when the server outcome
			// removes it from the hand, out:send flies it to the table from here.
			drag.over = false;
			return;
		}
		springBack();
	}

	function onCancel() {
		pressed = null;
		if (!drag.pointerActive) return;
		drag.pointerActive = false;
		springBack();
	}

	function springBack() {
		drag.returning = true;
		drag.over = false;
		drag.dx = 0;
		drag.dy = 0;
		setTimeout(clearDrag, SPRING_BACK_MS);
	}

	// Safety net for the frozen drop: once the played card leaves the hand the
	// drag state is cleared; if it is still in the hand when the busy lock
	// releases (server rejected the move), spring it back instead.
	$effect(() => {
		if (!drag.key || drag.pointerActive || drag.returning) return;
		const inHand = game.view?.playerHand.some((c) => cardKey(c) === drag.key);
		if (!inHand) clearDrag();
		else if (!game.busy) springBack();
	});
</script>

{#if game.view}
	<div class="flex items-end justify-center gap-2 px-2 pt-3 pb-2 sm:gap-3">
		{#each game.view.playerHand as card, index (cardKey(card))}
			{@const isDragged = drag.key === cardKey(card)}
			<!-- Presentational wrapper: the CardView button inside is the accessible control -->
			<div
				role="presentation"
				animate:flip={{ duration: 300 }}
				in:fly={{ y: 30, duration: 450, easing: backOut }}
				out:send={{ key: cardKey(card) }}
				class="touch-none {isDragged ? 'relative z-50' : ''}"
				style={isDragged
					? `transform: translate(${drag.dx}px, ${drag.dy}px)${drag.returning ? '' : ' scale(1.08) rotate(3deg)'};` +
						` transition: ${drag.returning ? 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none'};`
					: ''}
				onpointerdown={(e) => onDown(e, index, card)}
				onpointermove={onMove}
				onpointerup={onUp}
				onpointercancel={onCancel}
			>
				<CardView
					{card}
					clickable={canPlay}
					dragging={isDragged}
					isTrump={card.suit === trumpSuit}
					onclick={() => onClick(index)}
				/>
			</div>
		{/each}
	</div>
{/if}
