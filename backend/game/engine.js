// engine.js - Pure Brisca rules, server-side.
//
// Refactored from the original client-side js/game-state.js and the LOGIC half of
// js/game-logic.js. All functions operate on a passed-in plain `state` object
// (no module-level singletons, no DOM, no setTimeout). The `state` is fully
// JSON-serializable so it can be persisted to Redis verbatim.
//
// Card shape: { suit: string, value: number }

import { SUITS, VALUES, VALUE_POINTS, RANK_MAP, INITIAL_HAND_SIZE } from './constants.js';
import { chooseAiCard, leadForAi } from './ai.js';

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
    aiHand: [],
    playerPoints: 0,
    aiPoints: 0,
    trumpCard: null,
    trumpSuit: '',       // captured once; rules read this, never trumpCard.suit (GOTCHA #1)
    trumpTaken: false,   // becomes true when the trump is picked up on the deck===1 trick
    playerLeads: true,
    currentAiCard: null,
    playerWonCards: [],
    aiWonCards: [],
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
  state.aiHand = [];
  for (let i = 0; i < INITIAL_HAND_SIZE; i++) {
    state.playerHand.push(drawCard(state));
    state.aiHand.push(drawCard(state));
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
function determineWinner(state, playerCard, aiCard) {
  const trumpSuit = state.trumpSuit;
  const leadSuit = state.playerLeads ? playerCard.suit : aiCard.suit;

  // Both played trump suit
  if (playerCard.suit === trumpSuit && aiCard.suit === trumpSuit) {
    return getCardRank(playerCard) > getCardRank(aiCard) ? 'player' : 'ai';
  }
  // Only player played trump
  if (playerCard.suit === trumpSuit) {
    return 'player';
  }
  // Only AI played trump
  if (aiCard.suit === trumpSuit) {
    return 'ai';
  }
  // Nobody played trump - higher card of the lead suit wins
  if (state.playerLeads) {
    if (aiCard.suit === leadSuit) {
      return getCardRank(playerCard) > getCardRank(aiCard) ? 'player' : 'ai';
    }
    return 'player'; // AI didn't follow suit and didn't trump
  } else {
    if (playerCard.suit === leadSuit) {
      return getCardRank(playerCard) > getCardRank(aiCard) ? 'player' : 'ai';
    }
    return 'ai'; // Player didn't follow suit and didn't trump
  }
}

// Record that the player is void in a suit (used by hard-mode AI inference).
function markPlayerVoid(state, suit) {
  if (!state.playerVoidSuits.includes(suit)) {
    state.playerVoidSuits.push(suit);
  }
}

// Observe void: only when the human is RESPONDING (aiCard is the lead) and they
// fail to follow the lead suit. Mirrors game-logic.js:120-122. Must run before the
// AI computes its next lead (GOTCHA #2).
function recordVoidIfBroke(state, playerCard, aiCard) {
  if (playerCard.suit !== aiCard.suit) {
    markPlayerVoid(state, aiCard.suit);
  }
}

// Store the just-completed trick for the winner's display pile AND append both
// cards to the full history. Ported from addCardTo*WonCards in game-state.js.
function recordTrick(state, winner, playerCard, aiCard) {
  if (winner === 'player') {
    state.playerWonCards = [playerCard, aiCard];
  } else {
    state.aiWonCards = [playerCard, aiCard];
  }
  if (playerCard) state.allPlayedCards.push(playerCard);
  if (aiCard) state.allPlayedCards.push(aiCard);
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
  let aiDrew = false;
  let trumpPickedUp = false;

  if (state.deck.length >= 2) {
    if (winnerIsPlayer) {
      playerDraw = drawCard(state);
      state.playerHand.push(playerDraw);
      state.aiHand.push(drawCard(state));
      aiDrew = true;
    } else {
      state.aiHand.push(drawCard(state));
      aiDrew = true;
      playerDraw = drawCard(state);
      state.playerHand.push(playerDraw);
    }
  } else if (state.deck.length === 1) {
    trumpPickedUp = true;
    state.trumpTaken = true;
    if (winnerIsPlayer) {
      playerDraw = drawCard(state);          // winner draws the last deck card
      state.playerHand.push(playerDraw);
      state.aiHand.push(state.trumpCard);   // loser picks up the trump
      aiDrew = true;
    } else {
      state.aiHand.push(drawCard(state));   // winner draws the last deck card
      aiDrew = true;
      playerDraw = state.trumpCard;          // loser picks up the trump
      state.playerHand.push(state.trumpCard);
    }
  }
  // deck empty: no draws

  return { player: playerDraw, aiDrew, trumpPickedUp };
}

function computeGameOver(state) {
  const winner =
    state.playerPoints > state.aiPoints ? 'player' :
    state.playerPoints < state.aiPoints ? 'ai' : 'tie';
  return {
    winner,
    playerPoints: state.playerPoints,
    aiPoints: state.aiPoints,
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
  let aiCard;
  if (humanLed) {
    aiCard = chooseAiCard(state, playerCard); // AI responds (splices from aiHand)
  } else {
    aiCard = state.currentAiCard;             // AI already led; resolve against it
    recordVoidIfBroke(state, playerCard, aiCard);
  }

  // Resolve (determineWinner must run before playerLeads is mutated).
  const winner = determineWinner(state, playerCard, aiCard);
  const trickPoints = (VALUE_POINTS[playerCard.value] || 0) + (VALUE_POINTS[aiCard.value] || 0);
  if (winner === 'player') {
    state.playerPoints += trickPoints;
  } else {
    state.aiPoints += trickPoints;
  }
  state.playerLeads = winner === 'player';

  recordTrick(state, winner, playerCard, aiCard);

  // Draw (winner first) — must precede the AI's next lead.
  const draws = drawLogic(state, winner);

  state.currentAiCard = null;

  let gameOver = null;
  let aiLead = null;
  if (state.playerHand.length === 0 && state.aiHand.length === 0) {
    state.gameActive = false;
    gameOver = computeGameOver(state);
  } else if (winner === 'ai') {
    // The AI won, so it leads the next trick. state.playerLeads is already false,
    // so leadForAi() sees "AI is leading". Void/draw are already applied above.
    aiLead = leadForAi(state); // splices from aiHand
    state.currentAiCard = aiLead;
  }

  state.seq++;

  return {
    humanLed,
    playerCard,
    aiCard,
    winner,
    trickPoints,
    draws,
    gameOver,
    aiLead: aiLead ? { card: aiLead } : null
  };
}

// ------------------------------------------------------------------
// Public, anti-cheat projection sent to the browser. Never includes aiHand or
// deck contents (only counts), nor the AI's private inference state (GOTCHA #6).
// ------------------------------------------------------------------
function toSnapshot(state) {
  return {
    gameId: state.gameId,
    difficulty: state.difficulty,
    gameActive: state.gameActive,
    seq: state.seq,
    playerHand: state.playerHand,
    aiHandCount: state.aiHand.length,
    deckCount: state.deck.length,
    trumpCard: state.trumpCard,
    playerPoints: state.playerPoints,
    aiPoints: state.aiPoints,
    playerLeads: state.playerLeads,
    currentAiCard: state.currentAiCard,
    playerWonCards: state.playerWonCards,
    aiWonCards: state.aiWonCards,
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
