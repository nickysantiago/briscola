import { io, type Socket } from 'socket.io-client';
import { clearStoredGameId, game, getStoredGameId, setLatest } from './game.svelte';
import { playTrickAnimation } from './orchestrator';
import type { Difficulty, ErrorState, Snapshot, TrickOutcome } from './types';

let socket: Socket | null = null;

// The hand slot the human last clicked — kept for parity with the old
// controller; the orchestrator anchors flights on card identity instead.
let lastClickedIndex = 0;

/**
 * Create the socket and wire the three server events. Called once from
 * onMount — never at module scope, so nothing runs during the static build.
 * Same-origin connection: nginx (or the Vite dev proxy) forwards /socket.io/.
 */
export function connect() {
	if (socket) return;
	socket = io();

	socket.on('gameState', (snapshot: Snapshot) => {
		setLatest(snapshot);
	});

	socket.on('trickResolved', (outcome: TrickOutcome) => {
		// Always release the lock, even if an animation step throws — otherwise
		// the board would be stuck ignoring clicks for the rest of the game.
		playTrickAnimation(outcome, lastClickedIndex)
			.catch((err) => console.error('[brisca] animation failed:', err))
			.finally(() => {
				game.busy = false;
			});
	});

	socket.on('errorState', (err: ErrorState) => {
		game.busy = false;
		if (err?.code === 'stale') {
			// Out of sync (double-emit / reconnect) — re-pull authoritative state.
			const gid = getStoredGameId();
			if (gid) emitResume(gid);
		} else if (err?.code === 'unknownGame') {
			// Saved game is gone (expired/cleared). Drop the id; stay on this screen.
			clearStoredGameId();
		}
		console.warn('[brisca] errorState:', err?.code);
	});
}

export function emitNewGame(difficulty: Difficulty) {
	socket?.emit('newGame', { difficulty });
}

export function emitPlayCard(gameId: string, index: number, seq: number) {
	lastClickedIndex = index;
	socket?.emit('playCard', { gameId, index, seq });
}

export function emitResume(gameId: string) {
	socket?.emit('resume', { gameId });
}
