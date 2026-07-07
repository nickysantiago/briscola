// engine.js - Pure Brisca rules, server-side.
//
// All functions operate on a passed-in plain `state` object (no module-level
// singletons, no DOM, no timers). The state is fully JSON-serializable so it
// can be persisted to Redis verbatim.
//
// The state is a symmetric two-seat model (seats A and B). Solo mode is
// "seat B is bot-controlled" (state.botSeat === 'B'): the same trick
// resolution, scoring and draw logic serves both single-player-vs-AI and
// human-vs-human games. A trick is two half-moves: the leader's card sits in
// state.pendingCard until the other seat responds.
//
// Card shape: { suit: string, value: number }

import { SUITS, VALUES, VALUE_POINTS, RANK_MAP, INITIAL_HAND_SIZE } from './constants.js';
import { chooseAiCard } from './ai.js';

const DIFFICULTIES = ['easy', 'normal', 'hard'];

// Persisted-state format version. States written before the two-seat model
// (no stateVersion field) are not loadable; the server treats them as unknown.
const STATE_VERSION = 2;

const otherSeat = (seat) => (seat === 'A' ? 'B' : 'A');

// The seat that must act next: the leader while no card is on the table,
// otherwise the follower.
const actorSeat = (state) =>
  state.pendingCard === null ? state.leader : otherSeat(state.leader);

// ------------------------------------------------------------------
// State construction
// ------------------------------------------------------------------

function baseState(gameId) {
  return {
    stateVersion: STATE_VERSION,
    gameId,
    mode: 'solo',        // 'solo' | 'multi'
    botSeat: null,       // 'B' in solo, null in multi
    difficulty: null,    // solo only
    gameActive: true,
    seq: 0,              // turn token; incremented on every half-move
    deck: [],
    trumpCard: null,
    trumpSuit: '',       // captured once at deal; rules read this, never trumpCard.suit
    trumpTaken: false,   // becomes true when the trump is picked up on the deck===1 trick
    leader: 'A',         // seat leading the current trick
    pendingCard: null,   // the leader's card while awaiting the follower's response
    seats: {
      A: { hand: [], points: 0, wonCards: [], voidSuits: [] },
      B: { hand: [], points: 0, wonCards: [], voidSuits: [] }
    },
    allPlayedCards: [],  // card-counting history (both cards of every resolved trick)
    // Multiplayer session fields (written by the server layer, persisted along
    // with the rules state; all inert in solo mode).
    names: null,               // { A, B } display names
    tokens: null,              // { A, B } per-seat reconnect tokens; never in snapshots
    lobbyCode: null,
    turnDeadline: null,        // epoch ms; null = disarmed (solo, paused, or over)
    turnRemainingMs: null,     // stashed remaining time while paused by a disconnect
    disconnected: { A: null, B: null }, // grace-confirmed disconnect epoch ms per seat
    disconnectDeadline: null   // earliest disconnect + 24h; restart-safe
  };
}

function dealNewGame(state) {
  shuffleDeck(state);
  dealInitialHands(state);
  state.trumpCard = drawCard(state);
  state.trumpSuit = state.trumpCard.suit;
}

// Create a fresh solo game: shuffled deck, both hands dealt, trump drawn.
// The human (seat A) always leads the first trick.
function createGame(difficulty, gameId) {
  const state = baseState(gameId);
  state.difficulty = DIFFICULTIES.includes(difficulty) ? difficulty : 'normal';
  state.botSeat = 'B';
  dealNewGame(state);
  return state;
}

// Create a fresh two-human game. The host (seat A) leads the first trick.
// Pure: no clock reads; the server layer arms turnDeadline and sets tokens.
function createMultiplayerGame({ gameId, hostName, guestName }) {
  const state = baseState(gameId);
  state.mode = 'multi';
  state.names = { A: hostName, B: guestName };
  dealNewGame(state);
  return state;
}

// ------------------------------------------------------------------
// Deck
// ------------------------------------------------------------------

// Build the 40-card deck and shuffle it uniformly (Fisher-Yates).
function shuffleDeck(state) {
  state.deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      state.deck.push({ suit, value });
    }
  }
  for (let i = state.deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [state.deck[i], state.deck[j]] = [state.deck[j], state.deck[i]];
  }
}

function drawCard(state) {
  return state.deck.length ? state.deck.pop() : null;
}

// Seat A receives the first card of each round, matching the original
// player-then-AI deal order (part of the golden-master RNG contract).
function dealInitialHands(state) {
  state.seats.A.hand = [];
  state.seats.B.hand = [];
  for (let i = 0; i < INITIAL_HAND_SIZE; i++) {
    state.seats.A.hand.push(drawCard(state));
    state.seats.B.hand.push(drawCard(state));
  }
}

// ------------------------------------------------------------------
// Trick resolution
// ------------------------------------------------------------------

function getCardRank(card) {
  return RANK_MAP[card.value];
}

// Decide the winning seat of a two-card trick. Reads state.trumpSuit (never
// state.trumpCard.suit) and state.leader to know the lead suit. Must be called
// while state.leader still reflects THIS trick's leader.
function determineWinner(state, cards) {
  const trumpSuit = state.trumpSuit;
  const leader = state.leader;
  const follower = otherSeat(leader);
  const leadCard = cards[leader];
  const followCard = cards[follower];

  // Both played trump suit
  if (leadCard.suit === trumpSuit && followCard.suit === trumpSuit) {
    return getCardRank(leadCard) > getCardRank(followCard) ? leader : follower;
  }
  // Only one side trumped
  if (leadCard.suit === trumpSuit) return leader;
  if (followCard.suit === trumpSuit) return follower;
  // Nobody played trump - higher card of the lead suit wins; a follower who
  // broke suit (and didn't trump) loses to the leader.
  if (followCard.suit === leadCard.suit) {
    return getCardRank(leadCard) > getCardRank(followCard) ? leader : follower;
  }
  return leader;
}

// Observe void: when the follower fails to follow the lead suit, record it
// against the follower (used by hard-mode AI inference on seat A's voids).
// Must run before the bot computes its next lead so hard mode can use the
// fresh inference.
function recordVoidIfBroke(state, followerSeat, followCard, leadCard) {
  if (followCard.suit !== leadCard.suit) {
    const voids = state.seats[followerSeat].voidSuits;
    if (!voids.includes(leadCard.suit)) {
      voids.push(leadCard.suit);
    }
  }
}

// Store the just-completed trick for the winner's display pile (which shows
// only the most recent trick) AND append both cards to the card-counting
// history. The history push order is seat A then seat B, always — hard mode's
// deterministic seeding hashes this sequence, so it must stay stable.
function recordTrick(state, winner, cards) {
  state.seats[winner].wonCards = [cards[winner], cards[otherSeat(winner)]];
  if (cards.A) state.allPlayedCards.push(cards.A);
  if (cards.B) state.allPlayedCards.push(cards.B);
}

// Draw cards after a trick. The trick WINNER draws first. On the deck===1
// trick the winner takes the last deck card and the LOSER picks up the trump
// (the trumpCard object is kept intact for display; only trumpTaken flips).
// Returns { A: Card|null, B: Card|null, trumpPickedUp } — what each seat drew.
function drawLogic(state, winner) {
  const loser = otherSeat(winner);
  const draws = { A: null, B: null, trumpPickedUp: false };

  if (state.deck.length >= 2) {
    draws[winner] = drawCard(state);
    state.seats[winner].hand.push(draws[winner]);
    draws[loser] = drawCard(state);
    state.seats[loser].hand.push(draws[loser]);
  } else if (state.deck.length === 1) {
    draws.trumpPickedUp = true;
    state.trumpTaken = true;
    draws[winner] = drawCard(state);           // winner draws the last deck card
    state.seats[winner].hand.push(draws[winner]);
    draws[loser] = state.trumpCard;            // loser picks up the trump
    state.seats[loser].hand.push(state.trumpCard);
  }
  // deck empty: no draws

  return draws;
}

function computeGameOver(state) {
  const a = state.seats.A.points;
  const b = state.seats.B.points;
  return {
    winner: a > b ? 'A' : a < b ? 'B' : 'tie',
    points: { A: a, B: b }
  };
}

// ------------------------------------------------------------------
// Half-move primitives. applyMove() is the public entry the server calls for
// ANY seat's action; commitLead/commitResponse are the internal halves (also
// driven directly for the bot, whose card is already spliced by the AI).
// Both mutate `state` in place and bump seq.
// ------------------------------------------------------------------

// MoveResult:
//   { kind: 'led', seat, card }                       — trick awaits the follower
//   { kind: 'resolved', leader, cards: {A,B}, winner, trickPoints,
//     draws: {A,B,trumpPickedUp}, gameOver: {winner,points}|null }
function applyMove(state, seat, index) {
  if (!state.gameActive) throw new Error('game is not active');
  if (seat !== 'A' && seat !== 'B') throw new Error('invalid seat');
  if (actorSeat(state) !== seat) throw new Error('not this seat\'s turn');
  const hand = state.seats[seat].hand;
  if (!Number.isInteger(index) || index < 0 || index >= hand.length) {
    throw new Error('invalid card index');
  }
  const card = hand.splice(index, 1)[0];
  return state.pendingCard === null
    ? commitLead(state, seat, card)
    : commitResponse(state, seat, card);
}

function commitLead(state, seat, card) {
  state.pendingCard = card;
  state.seq++;
  return { kind: 'led', seat, card };
}

function commitResponse(state, followerSeat, card) {
  const leader = state.leader;
  const cards = { [leader]: state.pendingCard, [followerSeat]: card };

  recordVoidIfBroke(state, followerSeat, card, state.pendingCard);

  // Resolve (determineWinner must run before state.leader is mutated).
  const winner = determineWinner(state, cards);
  const trickPoints = (VALUE_POINTS[cards.A.value] || 0) + (VALUE_POINTS[cards.B.value] || 0);
  state.seats[winner].points += trickPoints;
  state.leader = winner;
  state.pendingCard = null;

  recordTrick(state, winner, cards);

  // Draw (winner first) — must precede any bot follow-up lead.
  const draws = drawLogic(state, winner);

  let gameOver = null;
  if (state.seats.A.hand.length === 0 && state.seats.B.hand.length === 0) {
    state.gameActive = false;
    gameOver = computeGameOver(state);
  }

  state.seq++;

  return { kind: 'resolved', leader, cards, winner, trickPoints, draws, gameOver };
}

// ------------------------------------------------------------------
// Bot adapter: ai.js was written against the original asymmetric field names
// and is kept byte-identical (its deterministic seeding hashes exact field
// values). This view maps the seat state onto those names with SHARED array
// references — chooseAiCard splices state.seats.B.hand through view.aiHand.
// ------------------------------------------------------------------
function botView(state) {
  const bot = state.seats.B;
  const human = state.seats.A;
  return {
    difficulty: state.difficulty,
    trumpSuit: state.trumpSuit,
    trumpCard: state.trumpCard,
    trumpTaken: state.trumpTaken,
    deck: state.deck,
    allPlayedCards: state.allPlayedCards,
    aiHand: bot.hand,
    playerHand: human.hand,
    aiPoints: bot.points,
    playerPoints: human.points,
    playerLeads: state.leader === 'A',
    playerVoidSuits: human.voidSuits
  };
}

// ------------------------------------------------------------------
// The solo orchestrator the socket layer calls for a human action. Resolves a
// full trick atomically (driving the bot's response and, if the bot wins, its
// next lead) and returns a timing-free description the client animates.
// Return shape is the original single-player contract. Mutates `state`.
// ------------------------------------------------------------------
function applyPlayerMove(state, index) {
  const humanLed = state.pendingCard === null;

  let res;
  if (humanLed) {
    const led = applyMove(state, 'A', index);
    const aiCard = chooseAiCard(botView(state), led.card); // bot responds (splices its hand)
    res = commitResponse(state, 'B', aiCard);
  } else {
    res = applyMove(state, 'A', index); // bot already led; resolve against pendingCard
  }

  let aiLead = null;
  if (res.winner === 'B' && state.gameActive) {
    // The bot won, so it leads the next trick. Void/draw are already applied.
    aiLead = chooseAiCard(botView(state), null); // splices its hand
    commitLead(state, 'B', aiLead);
  }

  return {
    humanLed,
    playerCard: res.cards.A,
    aiCard: res.cards.B,
    winner: res.winner === 'A' ? 'player' : 'ai',
    trickPoints: res.trickPoints,
    draws: { player: res.draws.A, aiDrew: res.draws.B !== null, trumpPickedUp: res.draws.trumpPickedUp },
    gameOver: projectGameOver(res.gameOver, 'A', state),
    aiLead: aiLead ? { card: aiLead } : null
  };
}

// ------------------------------------------------------------------
// Seat-relative projections. The wire format keeps the original field names
// ("player" = the receiving seat, "ai" = its opponent) so the client renders
// solo and multiplayer games identically.
// ------------------------------------------------------------------

function projectGameOver(gameOver, seat, state) {
  if (!gameOver) return null;
  const opp = otherSeat(seat);
  return {
    winner: gameOver.winner === 'tie' ? 'tie' : gameOver.winner === seat ? 'player' : 'ai',
    playerPoints: gameOver.points[seat],
    aiPoints: gameOver.points[opp],
    difficulty: state.difficulty
  };
}

// Seat-relative projection of a resolved MoveResult, for multiplayer where
// each seat animates the same trick from its own side.
function outcomeFor(result, seat, state) {
  const opp = otherSeat(seat);
  return {
    humanLed: result.leader === seat,
    playerCard: result.cards[seat],
    aiCard: result.cards[opp],
    winner: result.winner === seat ? 'player' : 'ai',
    trickPoints: result.trickPoints,
    draws: {
      player: result.draws[seat],
      aiDrew: result.draws[opp] !== null,
      trumpPickedUp: result.draws.trumpPickedUp
    },
    gameOver: projectGameOver(result.gameOver, seat, state),
    aiLead: null
  };
}

// ------------------------------------------------------------------
// Public, anti-cheat projection sent to the browser. Never includes the
// opponent's hand or deck contents (only counts), nor private inference or
// session secrets (tokens), so the opponent cannot be read from devtools.
// ------------------------------------------------------------------
function toSnapshot(state, seat = 'A', now = Date.now()) {
  const opp = otherSeat(seat);
  const me = state.seats[seat];
  const them = state.seats[opp];
  return {
    gameId: state.gameId,
    mode: state.mode,
    difficulty: state.difficulty,
    gameActive: state.gameActive,
    seq: state.seq,
    playerHand: me.hand,
    aiHandCount: them.hand.length,
    deckCount: state.deck.length,
    trumpCard: state.trumpCard,
    playerPoints: me.points,
    aiPoints: them.points,
    playerLeads: state.leader === seat,
    currentAiCard: state.pendingCard !== null && state.leader === opp ? state.pendingCard : null,
    myPendingCard: state.pendingCard !== null && state.leader === seat ? state.pendingCard : null,
    myTurn: state.gameActive && actorSeat(state) === seat,
    playerWonCards: me.wonCards,
    aiWonCards: them.wonCards,
    gameOver: state.gameActive ? null : projectGameOver(computeGameOver(state), seat, state),
    names: state.names ? { me: state.names[seat], opponent: state.names[opp] } : null,
    turnDeadline: state.turnDeadline,
    serverNow: now,
    opponentDisconnected: !!state.disconnected[opp],
    disconnectDeadline: state.disconnectDeadline
  };
}

export {
  STATE_VERSION,
  otherSeat,
  actorSeat,
  createGame,
  createMultiplayerGame,
  getCardRank,
  determineWinner,
  drawLogic,
  applyMove,
  applyPlayerMove,
  outcomeFor,
  toSnapshot
};
