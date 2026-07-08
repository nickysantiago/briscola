import { io, type Socket } from 'socket.io-client';
import {
	clearGame,
	clearStoredGameId,
	clearStoredMpToken,
	finishLoading,
	game,
	getStoredGameId,
	getStoredMpToken,
	resetMp,
	setLatest,
	setStoredMpToken
} from './game.svelte';
import { playLeadAnimation, playTrickAnimation } from './orchestrator';
import type {
	Difficulty,
	ErrorState,
	GameTerminated,
	LobbyCreated,
	LobbyJoined,
	OpponentDisconnected,
	OpponentJoined,
	Snapshot,
	TrickLed,
	TrickOutcome,
	TurnTimeout
} from './types';

let socket: Socket | null = null;

// The hand slot the human last clicked — kept for parity with the old
// controller; the orchestrator anchors flights on card identity instead.
let lastClickedIndex = 0;

let timeoutNoticeTimer: ReturnType<typeof setTimeout> | null = null;

// Animations run strictly one at a time: in multiplayer the opponent's next
// lead can arrive while the previous trick is still animating, and two drivers
// mutating the table concurrently would corrupt the flights. The busy lock is
// held until the queue drains; it always releases, even if a step throws —
// otherwise the board would be stuck ignoring clicks for the rest of the game.
let animChain: Promise<void> = Promise.resolve();
let animPending = 0;

function enqueueAnimation(fn: () => Promise<void>) {
	animPending++;
	game.busy = true;
	animChain = animChain
		.then(fn)
		.catch((err) => console.error('[brisca] animation failed:', err))
		.finally(() => {
			animPending--;
			if (animPending === 0) game.busy = false;
		});
}

/**
 * Create the socket and wire the server events. Called once from onMount —
 * never at module scope, so nothing runs during the static build.
 * Same-origin connection: nginx (or the Vite dev proxy) forwards /socket.io/.
 */
export function connect() {
	if (socket) return;
	socket = io();

	// Socket.io transparently reconnects, but the server keys seat sessions by
	// socket id — a fresh connection must re-authenticate or it receives
	// nothing. The first connect is handled by the boot sequence in +page.
	let firstConnect = true;
	socket.on('connect', () => {
		if (firstConnect) {
			firstConnect = false;
			return;
		}
		const token = getStoredMpToken();
		if (token) {
			emitReconnectMultiplayerGame(token);
		} else {
			const gid = getStoredGameId();
			if (gid && game.screen === 'game') emitResume(gid);
		}
	});

	socket.on('gameState', (snapshot: Snapshot) => {
		setLatest(snapshot);
	});

	socket.on('trickResolved', (outcome: TrickOutcome) => {
		// Server-initiated resolutions (opponent's response, timeout autoplay)
		// arrive without a local click; the queue takes the lock before animating.
		enqueueAnimation(() => playTrickAnimation(outcome, lastClickedIndex));
	});

	socket.on('trickLed', (led: TrickLed) => {
		enqueueAnimation(() => playLeadAnimation(led.card, led.mine));
	});

	socket.on('lobbyCreated', (lobby: LobbyCreated) => {
		setStoredMpToken(lobby.token);
		game.mp.code = lobby.code;
		game.mp.formError = null;
		game.screen = 'mpWaiting';
		finishLoading();
	});

	socket.on('lobbyJoined', (joined: LobbyJoined) => {
		setStoredMpToken(joined.token);
		game.mp.code = joined.code;
		game.mp.opponentName = joined.opponentName;
		game.mp.formError = null;
		// The seat-B snapshot follows immediately and flips the screen to 'game'.
	});

	socket.on('opponentJoined', (joined: OpponentJoined) => {
		game.mp.opponentName = joined.opponentName;
	});

	socket.on('opponentDisconnected', (info: OpponentDisconnected) => {
		game.mp.opponentDisconnected = true;
		game.mp.disconnectDeadline = info.disconnectDeadline;
		game.mp.waitDismissed = false;
	});

	socket.on('opponentReconnected', () => {
		game.mp.opponentDisconnected = false;
		game.mp.disconnectDeadline = null;
		game.mp.waitDismissed = false;
	});

	socket.on('turnTimeout', (timeout: TurnTimeout) => {
		// Brief notice; the auto-played card itself animates via the normal
		// trickLed/trickResolved events that follow.
		game.mp.timedOut = { mine: timeout.mine };
		if (timeoutNoticeTimer) clearTimeout(timeoutNoticeTimer);
		timeoutNoticeTimer = setTimeout(() => {
			game.mp.timedOut = null;
		}, 3000);
	});

	socket.on('gameTerminated', (terminated: GameTerminated) => {
		clearStoredMpToken();
		clearGame();
		resetMp();
		game.mp.terminated = terminated.reason;
		game.screen = 'title';
		finishLoading();
	});

	socket.on('errorState', (err: ErrorState) => {
		game.busy = false;
		// A failed request must not strand the loading screen.
		finishLoading();
		switch (err?.code) {
			case 'stale': {
				// Out of sync (double-emit / reconnect) — re-pull authoritative state.
				const token = getStoredMpToken();
				if (token && game.view?.mode === 'multi') {
					emitReconnectMultiplayerGame(token);
				} else {
					const gid = getStoredGameId();
					if (gid) emitResume(gid);
				}
				break;
			}
			case 'unknownGame': {
				// Saved session is gone (expired/cleared). Drop the dead pointer; if
				// a multiplayer token just failed, fall back to a saved solo game.
				if (getStoredMpToken()) {
					clearStoredMpToken();
					const gid = getStoredGameId();
					if (gid) emitResume(gid);
				} else {
					clearStoredGameId();
				}
				break;
			}
			case 'badName':
			case 'unknownLobby':
			case 'lobbyFull':
			case 'lobbyCreateFailed':
				// Inline feedback on the create/join forms.
				game.mp.formError = err.message;
				break;
			default:
				break;
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

export function emitCreateMultiplayerGame(name: string) {
	socket?.emit('createMultiplayerGame', { name });
}

export function emitJoinMultiplayerGame(code: string, name: string) {
	socket?.emit('joinMultiplayerGame', { code, name });
}

export function emitReconnectMultiplayerGame(token: string) {
	socket?.emit('reconnectMultiplayerGame', { token });
}

export function emitEndGame(gameId: string) {
	socket?.emit('endGame', { gameId });
}

export function emitRequestRematch(gameId: string) {
	socket?.emit('requestRematch', { gameId });
}
