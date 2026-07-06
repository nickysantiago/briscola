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
	difficulty: Difficulty;
}

/** Public snapshot — never includes the AI's hand or the deck contents. */
export interface Snapshot {
	gameId: string;
	difficulty: Difficulty;
	gameActive: boolean;
	seq: number;
	playerHand: Card[];
	aiHandCount: number;
	deckCount: number;
	trumpCard: Card | null;
	playerPoints: number;
	aiPoints: number;
	playerLeads: boolean;
	currentAiCard: Card | null;
	playerWonCards: Card[];
	aiWonCards: Card[];
	gameOver: GameOverInfo | null;
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

export interface ErrorState {
	code:
		| 'stale'
		| 'unknownGame'
		| 'gameOver'
		| 'illegal'
		| 'newGameFailed'
		| 'resumeFailed'
		| 'playFailed';
	message: string;
	gameId?: string;
}
