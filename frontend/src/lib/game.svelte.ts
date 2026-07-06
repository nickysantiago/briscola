import { GAME_ID_KEY } from './constants';
import type { Card, Snapshot } from './types';

/**
 * Latest authoritative snapshot from the server. Deliberately NOT reactive:
 * nothing renders it. It is a buffer that `settle()` promotes to `game.view`
 * at the moment the board should visually catch up — immediately when idle,
 * or at the end of the trick animation when busy.
 */
let latest: Snapshot | null = null;

export const game = $state({
	screen: 'title' as 'title' | 'difficulty' | 'game',
	/** What the board renders. Lags `latest` while a trick animates. */
	view: null as Snapshot | null,
	/**
	 * UX lock: blocks clicks while a trick animates. The server's seq
	 * turn-guard is the real authority; this is purely cosmetic.
	 */
	busy: false,
	/** Play-area contents, driven by the animation orchestrator. */
	table: {
		playerCard: null as Card | null,
		aiCard: null as Card | null
	},
	/** Trick outcome banner + points popup, shown between flight and settle. */
	trick: null as { winner: 'player' | 'ai'; points: number } | null
});

export function setLatest(snap: Snapshot) {
	latest = snap;
	try {
		localStorage.setItem(GAME_ID_KEY, snap.gameId);
	} catch {
		// Storage unavailable (private mode) — resume just won't survive reloads.
	}
	// While a trick is animating we only stash the settled state; the
	// orchestrator's own settle step paints it at the right moment.
	if (!game.busy) settle();
}

/**
 * Promote the stashed snapshot to the rendered view. `showAiCard: false` is
 * used by the orchestrator when the AI leads the next trick: the snapshot
 * already contains `currentAiCard`, but that card must fly in afterwards
 * rather than pop into place.
 */
export function settle(showAiCard = true) {
	if (!latest) return;
	// Clone: the orchestrator mutates `view` mid-animation (splicing the played
	// card out of the hand, pushing onto the winner pile) and must never touch
	// the authoritative buffer.
	game.view = structuredClone(latest);
	game.table.playerCard = null;
	game.table.aiCard = showAiCard ? game.view.currentAiCard : null;
	game.trick = null;
	game.screen = 'game';
}

export function getStoredGameId(): string | null {
	try {
		return localStorage.getItem(GAME_ID_KEY);
	} catch {
		return null;
	}
}

export function clearStoredGameId() {
	try {
		localStorage.removeItem(GAME_ID_KEY);
	} catch {
		// ignore
	}
}

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
