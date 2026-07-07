import type { Card, Suit } from './types';

// Animation timing. Game rules, AI, and state logic live server-side; the only
// constants the client owns are presentation timings.
export const CARD_ANIMATION_DELAY = 1000;
export const FLIGHT_MS = 500;
export const PILE_FLIGHT_MS = 800;
export const STATUS_HOLD_MS = 1000;
export const POINTS_POPUP_MS = 1500;

// The loading screen stays up until the server state settles, but never less
// than this — and a failsafe dismisses it if the backend never answers.
export const MIN_LOADING_MS = 1000;
export const LOADING_FAILSAFE_MS = 8000;

export const GAME_ID_KEY = 'brisca:gameId';
export const MP_TOKEN_KEY = 'brisca:mpToken';

export const SUITS: Suit[] = ['Oros', 'Copas', 'Espadas', 'Bastos'];
export const VALUES = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];

/** Card artwork URL — reuses the original PNGs in static/cards/. */
export function cardImg(card: Card): string {
	return `cards/${card.value}_of_${card.suit.toLowerCase()}.png`;
}

/**
 * Unique identity for a card. A Brisca deck has exactly one of each card, so
 * suit+value is unique game-wide — safe as a list key and crossfade key.
 */
export function cardKey(card: Card): string {
	return `${card.suit}-${card.value}`;
}

/** Deterministic small rotation for pile cards, derived from card identity. */
export function cardTilt(card: Card, range = 10): number {
	let h = 0;
	for (const ch of cardKey(card)) h = (h * 31 + ch.charCodeAt(0)) | 0;
	return ((Math.abs(h) % 1000) / 1000) * range - range / 2;
}
