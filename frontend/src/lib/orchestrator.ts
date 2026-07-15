import { tick } from 'svelte';
import { CARD_ANIMATION_DELAY, cardKey, FLIGHT_MS, PILE_FLIGHT_MS, STATUS_HOLD_MS } from './constants';
import { delay, game, settle } from './game.svelte';
import type { Card, TrickOutcome } from './types';

/**
 * Drive the full per-trick animation from a server `trickResolved` outcome by
 * mutating reactive state on a schedule — Svelte transitions turn each
 * mutation into a card flight. Resolves when the board has settled (and, if
 * the AI now leads, after its lead card has flown in). The caller clears the
 * `busy` flag on resolution.
 *
 * Sequencing (same as the original animations.js):
 *   player card flies out → [humanLed: pause → AI response flies in] → pause
 *   → winner banner + points popup → both cards fly to the winner's pile
 *   → board settles on the stashed snapshot → [aiLead: pause → AI lead flies in]
 *
 * In multiplayer the leader's card is already on the table (it arrived via a
 * `trickLed` half-move), so the corresponding fly-in steps are skipped.
 */
export async function playTrickAnimation(outcome: TrickOutcome, clickedIndex: number) {
	const view = game.view;
	if (!view) {
		settle();
		return;
	}

	// 1. The played card leaves the hand (out:send) and lands in the play area
	//    (in:receive) — the crossfade pair animates the flight. Skipped when the
	//    card is already on the table from this trick's earlier trickLed.
	const alreadyLed =
		game.table.playerCard !== null && cardKey(game.table.playerCard) === cardKey(outcome.playerCard);
	if (!alreadyLed) {
		let idx = view.playerHand.findIndex((c) => cardKey(c) === cardKey(outcome.playerCard));
		if (idx < 0) idx = Math.min(clickedIndex, view.playerHand.length - 1);
		if (idx >= 0) view.playerHand.splice(idx, 1);
		game.table.playerCard = outcome.playerCard;
		await tick();
		await delay(FLIGHT_MS);
	}

	// 2. When this seat led, the opponent's response flies in after a beat. When
	//    this seat responded, the opponent's card is already on the table.
	if (outcome.humanLed && game.table.aiCard === null) {
		await delay(CARD_ANIMATION_DELAY);
		game.table.aiCard = outcome.aiCard;
		await tick();
	}
	await delay(CARD_ANIMATION_DELAY);

	// 3. Announce the winner: status banner + "+N" popup at the winning pile.
	game.trick = { winner: outcome.winner, points: outcome.trickPoints };
	await delay(STATUS_HOLD_MS);

	// 4. Both cards fly to the winner's pile. Clearing the table (out:send) and
	//    growing the displayed pile (in:receive) must happen in the same state
	//    update so the crossfade pairs match up.
	const pile = outcome.winner === 'player' ? view.playerWonCards : view.aiWonCards;
	game.table.playerCard = null;
	game.table.aiCard = null;
	pile.push(outcome.playerCard, outcome.aiCard);
	await tick();
	await delay(PILE_FLIGHT_MS);
	game.trick = null;

	// 5. Settle on the authoritative snapshot (it arrived before trickResolved):
	//    drawn card enters the hand, counts update, trump may be gone. On game
	//    over the snapshot's gameOver field brings up the panel.
	if (outcome.gameOver) {
		settle();
		return;
	}
	// The snapshot may already contain the opponent's next lead as
	// currentAiCard; keep it off the table here so it can fly in below (solo)
	// or via its own trickLed animation (multiplayer) instead of popping in.
	settle(false);

	// 6. Solo only: if the AI won, it leads the next trick — fly its lead in.
	if (outcome.aiLead) {
		await delay(CARD_ANIMATION_DELAY);
		game.table.aiCard = outcome.aiLead.card;
		await tick();
		await delay(FLIGHT_MS);
	}
}

/**
 * Animate a multiplayer half-move (`trickLed`): my own led card flies from my
 * hand to the table; the opponent's lead flies in from the top. Ends by
 * settling on the snapshot that traveled with the event, which carries the
 * pending card, the new seq and the re-armed turn deadline.
 */
export async function playLeadAnimation(card: Card, mine: boolean) {
	const view = game.view;
	if (!view) {
		settle();
		return;
	}

	if (mine) {
		const idx = view.playerHand.findIndex((c) => cardKey(c) === cardKey(card));
		if (idx >= 0) view.playerHand.splice(idx, 1);
		game.table.playerCard = card;
	} else {
		await delay(CARD_ANIMATION_DELAY / 2);
		game.table.aiCard = card;
	}
	await tick();
	await delay(FLIGHT_MS);

	// settle() re-derives the table from myPendingCard/currentAiCard — the same
	// card under the same crossfade key, so nothing visibly moves.
	settle();
}
