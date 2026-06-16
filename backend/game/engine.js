// engine.js - Pure Brisca rules, server-side.
//
// Refactored from the original client-side js/game-state.js and the LOGIC half of
// js/game-logic.js. All functions operate on a passed-in plain `state` object
// (no module-level singletons, no DOM, no setTimeout). The `state` is fully
// JSON-serializable so it can be persisted to Redis verbatim.
//
// Card shape: { suit: string, value: number }

import { SUITS, VALUES, VALUE_POINTS, RANK_MAP, INITIAL_HAND_SIZE } from './constants.js';
import { chooseGptCard, leadForAi } from './ai.js';

const DIFFICULTIES = ['easy', 'normal', 'hard'];

// ------------------------------------------------------------------
// State construction
// ------------------------------------------------------------------

// Create a fresh game state. The deck is shuffled, both hands dealt, and the
// trump drawn. The human always leads the first trick (matches the original).
function createGame(difficulty, gameId) {
  const diff = DIFFICULTIES.includes(difficulty) ? difficulty : 'normal';

  const state = {
    gameId,
    difficulty: diff,
    gameActive: true,
    seq: 0,
    deck: [],
    playerHand: [],
    gptHand: [],
    playerPoints: 0,
    gptPoints: 0,
    trumpCard: null,
    trumpSuit: '',       // captured once; rules read this, never trumpCard.suit (GOTCHA #1)
    trumpTaken: false,   // becomes true when the trump is picked up on the deck===1 trick
    playerLeads: true,
    currentGptCard: null,
    playerWonCards: [],
    gptWonCards: [],
    allPlayedCards: [],  // AI card-counting history (both cards of every resolved trick)
    playerVoidSuits: []  // ARRAY, not Set, so it serializes cleanly (GOTCHA #4)
  };

  shuffleDeck(state);
  dealInitialHands(state);
  state.trumpCard = drawCard(state);
  state.trumpSuit = state.trumpCard.suit;

  return state;
}

// ------------------------------------------------------------------
// Deck
// ------------------------------------------------------------------

// NOTE: ported verbatim from the original (a biased `Math.random()` sort).
// A uniform Fisher-Yates replacement is intended as a separate, isolated commit
// so the golden-master AI tests can attribute any behavior change to the shuffle.
function shuffleDeck(state) {
  state.deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      state.deck.push({ suit, value });
    }
  }
  state.deck = state.deck.sort(() => Math.random() - 0.5);
}

function drawCard(state) {
  return state.deck.length ? state.deck.pop() : null;
}

function dealInitialHands(state) {
  state.playerHand = [];
  state.gptHand = [];
  for (let i = 0; i < INITIAL_HAND_SIZE; i++) {
    state.playerHand.push(drawCard(state));
    state.gptHand.push(drawCard(state));
  }
}

// ------------------------------------------------------------------
// Trick resolution
// ------------------------------------------------------------------

function getCardRank(card) {
  return RANK_MAP[card.value];
}

// Decide the winner of a two-card trick. Reads state.trumpSuit (never
// state.trumpCard.suit) and state.playerLeads to know the lead suit. Must be
// called while state.playerLeads still reflects THIS trick's leader.
function determineWinner(state, playerCard, gptCard) {
  const trumpSuit = state.trumpSuit;
  const leadSuit = state.playerLeads ? playerCard.suit : gptCard.suit;

  // Both played trump suit
  if (playerCard.suit === trumpSuit && gptCard.suit === trumpSuit) {
    return getCardRank(playerCard) > getCardRank(gptCard) ? 'player' : 'gpt';
  }
  // Only player played trump
  if (playerCard.suit === trumpSuit) {
    return 'player';
  }
  // Only GPT played trump
  if (gptCard.suit === trumpSuit) {
    return 'gpt';
  }
  // Nobody played trump - higher card of the lead suit wins
  if (state.playerLeads) {
    if (gptCard.suit === leadSuit) {
      return getCardRank(playerCard) > getCardRank(gptCard) ? 'player' : 'gpt';
    }
    return 'player'; // GPT didn't follow suit and didn't trump
  } else {
    if (playerCard.suit === leadSuit) {
      return getCardRank(playerCard) > getCardRank(gptCard) ? 'player' : 'gpt';
    }
    return 'gpt'; // Player didn't follow suit and didn't trump
  }
}

// Record that the player is void in a suit (used by hard-mode AI inference).
function markPlayerVoid(state, suit) {
  if (!state.playerVoidSuits.includes(suit)) {
    state.playerVoidSuits.push(suit);
  }
}

// Observe void: only when the human is RESPONDING (gptCard is the lead) and they
// fail to follow the lead suit. Mirrors game-logic.js:120-122. Must run before the
// AI computes its next lead (GOTCHA #2).
function recordVoidIfBroke(state, playerCard, gptCard) {
  if (playerCard.suit !== gptCard.suit) {
    markPlayerVoid(state, gptCard.suit);
  }
}

// Store the just-completed trick for the winner's display pile AND append both
// cards to the full history. Ported from addCardTo*WonCards in game-state.js.
function recordTrick(state, winner, playerCard, gptCard) {
  if (winner === 'player') {
    state.playerWonCards = [playerCard, gptCard];
  } else {
    state.gptWonCards = [playerCard, gptCard];
  }
  if (playerCard) state.allPlayedCards.push(playerCard);
  if (gptCard) state.allPlayedCards.push(gptCard);
}

// Draw cards after a trick. Ported from continueAfterAnimation (game-logic.js:251-269).
// The trick WINNER draws first / draws the last deck card. On the deck===1 trick the
// winner takes the last deck card and the LOSER picks up the trump (trumpCard object is
// kept intact for display; only trumpTaken flips — GOTCHA #1).
// Returns what to tell the client to animate (the human's own draw + a count bump for
// the AI; the AI's drawn card is never revealed — GOTCHA #6).
function drawLogic(state, winner) {
  const winnerIsPlayer = winner === 'player';
  let playerDraw = null;
  let gptDrew = false;
  let trumpPickedUp = false;

  if (state.deck.length >= 2) {
    if (winnerIsPlayer) {
      playerDraw = drawCard(state);
      state.playerHand.push(playerDraw);
      state.gptHand.push(drawCard(state));
      gptDrew = true;
    } else {
      state.gptHand.push(drawCard(state));
      gptDrew = true;
      playerDraw = drawCard(state);
      state.playerHand.push(playerDraw);
    }
  } else if (state.deck.length === 1) {
    trumpPickedUp = true;
    state.trumpTaken = true;
    if (winnerIsPlayer) {
      playerDraw = drawCard(state);          // winner draws the last deck card
      state.playerHand.push(playerDraw);
      state.gptHand.push(state.trumpCard);   // loser picks up the trump
      gptDrew = true;
    } else {
      state.gptHand.push(drawCard(state));   // winner draws the last deck card
      gptDrew = true;
      playerDraw = state.trumpCard;          // loser picks up the trump
      state.playerHand.push(state.trumpCard);
    }
  }
  // deck empty: no draws

  return { player: playerDraw, gptDrew, trumpPickedUp };
}

function computeGameOver(state) {
  const winner =
    state.playerPoints > state.gptPoints ? 'player' :
    state.playerPoints < state.gptPoints ? 'gpt' : 'tie';
  return {
    winner,
    playerPoints: state.playerPoints,
    gptPoints: state.gptPoints,
    difficulty: state.difficulty
  };
}

// ------------------------------------------------------------------
// The single orchestrator the socket layer calls for a human action.
// Resolves a full trick atomically and returns a timing-free description the
// client animates. Mutates `state` in place.
// ------------------------------------------------------------------
function applyPlayerMove(state, index) {
  if (!state.gameActive) throw new Error('game is not active');
  if (!Number.isInteger(index) || index < 0 || index >= state.playerHand.length) {
    throw new Error('invalid card index');
  }

  const humanLed = state.playerLeads;
  const playerCard = state.playerHand.splice(index, 1)[0];

  // Determine the AI's card for THIS trick.
  let gptCard;
  if (humanLed) {
    gptCard = chooseGptCard(state, playerCard); // AI responds (splices from gptHand)
  } else {
    gptCard = state.currentGptCard;             // AI already led; resolve against it
    recordVoidIfBroke(state, playerCard, gptCard);
  }

  // Resolve (determineWinner must run before playerLeads is mutated).
  const winner = determineWinner(state, playerCard, gptCard);
  const trickPoints = (VALUE_POINTS[playerCard.value] || 0) + (VALUE_POINTS[gptCard.value] || 0);
  if (winner === 'player') {
    state.playerPoints += trickPoints;
  } else {
    state.gptPoints += trickPoints;
  }
  state.playerLeads = winner === 'player';

  recordTrick(state, winner, playerCard, gptCard);

  // Draw (winner first) — must precede the AI's next lead.
  const draws = drawLogic(state, winner);

  state.currentGptCard = null;

  let gameOver = null;
  let gptLead = null;
  if (state.playerHand.length === 0 && state.gptHand.length === 0) {
    state.gameActive = false;
    gameOver = computeGameOver(state);
  } else if (winner === 'gpt') {
    // The AI won, so it leads the next trick. state.playerLeads is already false,
    // so leadForAi() sees "GPT is leading". Void/draw are already applied above.
    gptLead = leadForAi(state); // splices from gptHand
    state.currentGptCard = gptLead;
  }

  state.seq++;

  return {
    humanLed,
    playerCard,
    gptCard,
    winner,
    trickPoints,
    draws,
    gameOver,
    gptLead: gptLead ? { card: gptLead } : null
  };
}

// ------------------------------------------------------------------
// Public, anti-cheat projection sent to the browser. Never includes gptHand or
// deck contents (only counts), nor the AI's private inference state (GOTCHA #6).
// ------------------------------------------------------------------
function toSnapshot(state) {
  return {
    gameId: state.gameId,
    difficulty: state.difficulty,
    gameActive: state.gameActive,
    seq: state.seq,
    playerHand: state.playerHand,
    gptHandCount: state.gptHand.length,
    deckCount: state.deck.length,
    trumpCard: state.trumpCard,
    playerPoints: state.playerPoints,
    gptPoints: state.gptPoints,
    playerLeads: state.playerLeads,
    currentGptCard: state.currentGptCard,
    playerWonCards: state.playerWonCards,
    gptWonCards: state.gptWonCards,
    gameOver: state.gameActive ? null : computeGameOver(state)
  };
}

export {
  createGame,
  shuffleDeck,
  drawCard,
  dealInitialHands,
  getCardRank,
  determineWinner,
  markPlayerVoid,
  recordVoidIfBroke,
  recordTrick,
  drawLogic,
  computeGameOver,
  applyPlayerMove,
  toSnapshot
};
