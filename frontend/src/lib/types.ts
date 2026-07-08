// The Socket.io contract with the backend. The server is the sole authority on
// game state; these are the exact shapes it sends/expects (see backend/server.js).

export type Suit = 'Oros' | 'Copas' | 'Espadas' | 'Bastos';

export interface Card {
	suit: Suit;
	value: number;
}

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface GameOverInfo {
	winner: 'player' | 'ai' | 'tie';
	playerPoints: number;
	aiPoints: number;
	difficulty: Difficulty | null; // null in multiplayer games
}

/**
 * Public snapshot — never includes the opponent's hand or the deck contents.
 * Seat-relative: "player" fields are the receiving seat, "ai" fields are its
 * opponent (a bot in solo, the other human in multiplayer).
 */
export interface Snapshot {
	gameId: string;
	mode: 'solo' | 'multi';
	difficulty: Difficulty | null;
	gameActive: boolean;
	seq: number;
	playerHand: Card[];
	aiHandCount: number;
	deckCount: number;
	trumpCard: Card | null;
	playerPoints: number;
	aiPoints: number;
	playerLeads: boolean;
	/** The opponent's led card awaiting my response (solo: the AI's lead). */
	currentAiCard: Card | null;
	/** My own led card while the opponent decides (multiplayer only). */
	myPendingCard: Card | null;
	/** Whether this seat is the one that must act (always true in live solo). */
	myTurn: boolean;
	playerWonCards: Card[];
	aiWonCards: Card[];
	gameOver: GameOverInfo | null;
	/** Display names, multiplayer only. */
	names: { me: string; opponent: string } | null;
	/** Epoch ms the current turn times out at; null = no clock (solo/paused). */
	turnDeadline: number | null;
	/** Server clock at snapshot time, for client skew correction. */
	serverNow: number;
	opponentDisconnected: boolean;
	/** Epoch ms the abandoned game terminates at (24h after the disconnect). */
	disconnectDeadline: number | null;
	/** Post-game "play again" votes; both true restarts the game server-side. */
	rematch: { me: boolean; opponent: boolean };
}

export interface TrickOutcome {
	humanLed: boolean;
	playerCard: Card;
	aiCard: Card;
	winner: 'player' | 'ai';
	trickPoints: number;
	draws: { player: Card | null; aiDrew: boolean; trumpPickedUp: boolean };
	gameOver: GameOverInfo | null;
	aiLead: { card: Card } | null;
}

/** A half-move hit the table (multiplayer): someone led a card. */
export interface TrickLed {
	mine: boolean;
	card: Card;
}

/** The 60s clock expired and this card was auto-played for `mine`'s seat. */
export interface TurnTimeout {
	mine: boolean;
	card: Card;
}

export interface LobbyCreated {
	code: string;
	token: string;
}

export interface LobbyJoined {
	token: string;
	code: string;
	opponentName: string;
}

export interface OpponentJoined {
	opponentName: string;
}

export type TerminationReason = 'youEnded' | 'opponentEnded' | 'expired';

export interface GameTerminated {
	reason: TerminationReason;
}

export interface OpponentDisconnected {
	disconnectDeadline: number;
}

export interface ErrorState {
	code:
		| 'stale'
		| 'unknownGame'
		| 'gameOver'
		| 'illegal'
		| 'newGameFailed'
		| 'resumeFailed'
		| 'playFailed'
		| 'badName'
		| 'unknownLobby'
		| 'lobbyFull'
		| 'lobbyCreateFailed'
		| 'notYourTurn'
		| 'cannotEndGame'
		| 'cannotRematch'
		| 'requestRematchFailed'
		| 'createMultiplayerGameFailed'
		| 'joinMultiplayerGameFailed'
		| 'reconnectMultiplayerGameFailed'
		| 'endGameFailed';
	message: string;
	gameId?: string;
}
