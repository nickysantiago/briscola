import { GAME_ID_KEY, MIN_LOADING_MS, MP_TOKEN_KEY } from './constants';
import type { Card, Snapshot, TerminationReason } from './types';

/**
 * Latest authoritative snapshot from the server. Deliberately NOT reactive:
 * nothing renders it. It is a buffer that `settle()` promotes to `game.view`
 * at the moment the board should visually catch up — immediately when idle,
 * or at the end of the trick animation when busy.
 */
let latest: Snapshot | null = null;

export type Screen =
	| 'title'
	| 'difficulty'
	| 'game'
	| 'mpMenu'
	| 'mpStart'
	| 'mpJoin'
	| 'mpWaiting';

export const game = $state({
	screen: 'title' as Screen,
	/**
	 * Loading overlay: up while the app boots or a newGame/resume round-trip is
	 * in flight, and always for at least MIN_LOADING_MS. Starts true so the
	 * very first render is the loading screen.
	 */
	loading: true,
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
	trick: null as { winner: 'player' | 'ai'; points: number } | null,
	/** Multiplayer session state (lobby flow, disconnects, termination). */
	mp: {
		/** Room code while hosting/waiting. */
		code: null as string | null,
		opponentName: null as string | null,
		/** Event-driven mirror of the opponent's connection state. */
		opponentDisconnected: false,
		disconnectDeadline: null as number | null,
		/** The player chose "Wait" — collapse the panel to a banner. */
		waitDismissed: false,
		/** Set when the server tears the session down; renders the notice. */
		terminated: null as TerminationReason | null,
		/** Transient "time's up" notice after a turnTimeout event. */
		timedOut: null as { mine: boolean } | null,
		/** serverNow - Date.now() from the freshest snapshot (clock skew). */
		skewMs: 0,
		/** Inline error message for the create/join forms. */
		formError: null as string | null
	}
});

export function setLatest(snap: Snapshot) {
	latest = snap;
	if (snap.mode === 'solo') {
		// Only solo games resume by gameId; multiplayer resumes by seat token.
		// A multiplayer snapshot must never clobber the saved solo game.
		try {
			localStorage.setItem(GAME_ID_KEY, snap.gameId);
		} catch {
			// Storage unavailable (private mode) — resume just won't survive reloads.
		}
	}
	game.mp.skewMs = snap.serverNow - Date.now();
	// Keep the disconnect mirror honest even when no event was seen (e.g. the
	// state was already flagged when we resumed by token).
	game.mp.opponentDisconnected = snap.opponentDisconnected;
	game.mp.disconnectDeadline = snap.disconnectDeadline;
	if (!snap.opponentDisconnected) game.mp.waitDismissed = false;
	// While a trick is animating we only stash the settled state; the
	// orchestrator's own settle step paints it at the right moment.
	if (!game.busy) settle();
}

/**
 * Promote the stashed snapshot to the rendered view. `showAiCard: false` is
 * used by the orchestrator when the opponent leads the next trick: the
 * snapshot already contains `currentAiCard`, but that card must fly in
 * afterwards rather than pop into place.
 */
export function settle(showAiCard = true) {
	if (!latest) return;
	// Clone: the orchestrator mutates `view` mid-animation (splicing the played
	// card out of the hand, pushing onto the winner pile) and must never touch
	// the authoritative buffer.
	game.view = structuredClone(latest);
	// Restore mid-trick table state from the snapshot (multiplayer: a led card
	// stays on the table while the other seat thinks; both fields are null in
	// settled solo states except the bot's own lead).
	game.table.playerCard = game.view.myPendingCard;
	game.table.aiCard = showAiCard ? game.view.currentAiCard : null;
	game.trick = null;
	game.screen = 'game';
	finishLoading();
}

/** Drop the buffered/rendered game entirely (session ended or terminated). */
export function clearGame() {
	latest = null;
	game.view = null;
	game.busy = false;
	game.table.playerCard = null;
	game.table.aiCard = null;
	game.trick = null;
}

/**
 * Walk away from the current multiplayer session: drop the seat token so it
 * cannot hijack the next boot (the reported bug: a finished multiplayer game
 * kept resuming over a newer solo game), clear the board, back to the title.
 */
export function leaveMultiplayer() {
	clearStoredMpToken();
	clearGame();
	resetMp();
	game.screen = 'title';
}

/** Reset the multiplayer session scaffolding (keeps `terminated` untouched). */
export function resetMp() {
	game.mp.code = null;
	game.mp.opponentName = null;
	game.mp.opponentDisconnected = false;
	game.mp.disconnectDeadline = null;
	game.mp.waitDismissed = false;
	game.mp.timedOut = null;
	game.mp.formError = null;
}

// Loading-screen lifecycle. `loadingSince` starts at module init, which is
// effectively the app's first render; the token invalidates pending
// dismissals when a new loading phase starts.
let loadingSince = Date.now();
let loadingToken = 0;

export function startLoading() {
	loadingToken++;
	loadingSince = Date.now();
	game.loading = true;
}

/** Dismiss the loading screen, but never before MIN_LOADING_MS has shown. */
export function finishLoading() {
	if (!game.loading) return;
	const token = ++loadingToken;
	const remain = Math.max(0, MIN_LOADING_MS - (Date.now() - loadingSince));
	setTimeout(() => {
		if (token === loadingToken) game.loading = false;
	}, remain);
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

export function getStoredMpToken(): string | null {
	try {
		return localStorage.getItem(MP_TOKEN_KEY);
	} catch {
		return null;
	}
}

export function setStoredMpToken(token: string) {
	try {
		localStorage.setItem(MP_TOKEN_KEY, token);
	} catch {
		// ignore
	}
}

export function clearStoredMpToken() {
	try {
		localStorage.removeItem(MP_TOKEN_KEY);
	} catch {
		// ignore
	}
}

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
