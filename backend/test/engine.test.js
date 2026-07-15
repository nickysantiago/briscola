// Engine rules tests + full-game invariants + golden-master regression anchors.
// Run with: node --test   (from the backend/ directory)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  createMultiplayerGame,
  determineWinner,
  drawLogic,
  applyMove,
  applyPlayerMove,
  actorSeat,
  toSnapshot
} from '../game/engine.js';

// --- deterministic seeded RNG so full games are reproducible ---
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function withSeed(seed, fn) {
  const orig = Math.random;
  Math.random = mulberry32(seed);
  try { return fn(); } finally { Math.random = orig; }
}

// suit shorthands (Oros is trump in the unit tests below)
const O = v => ({ suit: 'Oros', value: v });
const C = v => ({ suit: 'Copas', value: v });
const E = v => ({ suit: 'Espadas', value: v });

// Minimal seat scaffolding for the drawLogic unit tests.
function seatsState(extra = {}) {
  return {
    deck: [],
    trumpCard: O(5),
    trumpTaken: false,
    seats: {
      A: { hand: [], points: 0, wonCards: [], voidSuits: [] },
      B: { hand: [], points: 0, wonCards: [], voidSuits: [] }
    },
    ...extra
  };
}

// ------------------------------------------------------------------
// determineWinner
// ------------------------------------------------------------------
test('determineWinner: both trump → higher rank wins', () => {
  const s = { trumpSuit: 'Oros', leader: 'A' };
  assert.equal(determineWinner(s, { A: O(1), B: O(3) }), 'A'); // Ace(9) > 3(8)
  assert.equal(determineWinner(s, { A: O(3), B: O(1) }), 'B');
});

test('determineWinner: only one side trumps', () => {
  const s = { trumpSuit: 'Oros', leader: 'A' };
  assert.equal(determineWinner(s, { A: O(2), B: C(1) }), 'A'); // A trumps a non-trump Ace
  assert.equal(determineWinner(s, { A: C(1), B: O(2) }), 'B'); // B trumps
});

test('determineWinner: no trump, seat A leads', () => {
  const s = { trumpSuit: 'Oros', leader: 'A' };
  assert.equal(determineWinner(s, { A: C(5), B: C(1) }), 'B');  // B follows higher
  assert.equal(determineWinner(s, { A: C(1), B: C(5) }), 'A');  // A higher
  assert.equal(determineWinner(s, { A: C(5), B: E(1) }), 'A');  // B off-suit, no trump
});

test('determineWinner: no trump, seat B leads', () => {
  const s = { trumpSuit: 'Oros', leader: 'B' };
  assert.equal(determineWinner(s, { A: C(1), B: C(5) }), 'A');  // A follows higher
  assert.equal(determineWinner(s, { A: E(1), B: C(5) }), 'B');  // A off-suit, no trump
});

test('determineWinner: is seat-symmetric', () => {
  const asA = { trumpSuit: 'Oros', leader: 'A' };
  const asB = { trumpSuit: 'Oros', leader: 'B' };
  // Same trick mirrored: leader plays C5, follower follows with C1.
  assert.equal(determineWinner(asA, { A: C(5), B: C(1) }), 'B');
  assert.equal(determineWinner(asB, { B: C(5), A: C(1) }), 'A');
});

// ------------------------------------------------------------------
// drawLogic (the famous deck===1 trump pickup, GOTCHA #1)
// ------------------------------------------------------------------
test('drawLogic: deck>=2, the winner draws first', () => {
  const top = C(7), next = E(6);
  const s = seatsState({ deck: [E(2), next, top] });
  const r = drawLogic(s, 'A');
  assert.deepEqual(s.seats.A.hand[0], top);   // winner gets the popped (last) card first
  assert.deepEqual(s.seats.B.hand[0], next);
  assert.deepEqual(r.A, top);
  assert.deepEqual(r.B, next);
  assert.equal(r.trumpPickedUp, false);
  assert.equal(s.deck.length, 1);
});

test('drawLogic: deck===1, A won → A draws last card, B picks up trump', () => {
  const last = C(7), trump = O(5);
  const s = seatsState({ deck: [last], trumpCard: trump });
  const r = drawLogic(s, 'A');
  assert.deepEqual(s.seats.A.hand[0], last);
  assert.deepEqual(s.seats.B.hand[0], trump);
  assert.equal(s.trumpTaken, true);
  assert.equal(r.trumpPickedUp, true);
  assert.equal(s.deck.length, 0);
});

test('drawLogic: deck===1, B won → B draws last card, A picks up trump', () => {
  const last = C(7), trump = O(5);
  const s = seatsState({ deck: [last], trumpCard: trump });
  const r = drawLogic(s, 'B');
  assert.deepEqual(s.seats.B.hand[0], last);
  assert.deepEqual(s.seats.A.hand[0], trump);
  assert.equal(s.trumpTaken, true);
  assert.deepEqual(r.A, trump); // the loser's pickup is reported (it's their own card)
});

test('drawLogic: deck empty → no draws', () => {
  const s = seatsState({ trumpTaken: true });
  const r = drawLogic(s, 'A');
  assert.equal(r.A, null);
  assert.equal(r.B, null);
  assert.equal(s.seats.A.hand.length, 0);
});

// ------------------------------------------------------------------
// createGame / createMultiplayerGame / toSnapshot
// ------------------------------------------------------------------
test('createGame: initial invariants', () => {
  const s = createGame('hard', 'g1');
  assert.equal(s.stateVersion, 2);
  assert.equal(s.mode, 'solo');
  assert.equal(s.botSeat, 'B');
  assert.equal(s.deck.length, 33);          // 40 - 6 dealt - 1 trump
  assert.equal(s.seats.A.hand.length, 3);
  assert.equal(s.seats.B.hand.length, 3);
  assert.ok(s.trumpCard);
  assert.equal(s.trumpSuit, s.trumpCard.suit);
  assert.equal(s.trumpTaken, false);
  assert.equal(s.leader, 'A');
  assert.equal(s.pendingCard, null);
  assert.equal(actorSeat(s), 'A');
  assert.equal(s.gameActive, true);
  assert.equal(s.seq, 0);
  assert.deepEqual(s.seats.A.voidSuits, []);
  assert.equal(s.difficulty, 'hard');
});

test('createGame: unknown difficulty defaults to normal', () => {
  assert.equal(createGame('impossible', 'g').difficulty, 'normal');
});

test('createMultiplayerGame: initial invariants', () => {
  const s = createMultiplayerGame({ gameId: 'm1', hostName: 'Ana', guestName: 'Beto' });
  assert.equal(s.stateVersion, 2);
  assert.equal(s.mode, 'multi');
  assert.equal(s.botSeat, null);
  assert.equal(s.difficulty, null);
  assert.deepEqual(s.names, { A: 'Ana', B: 'Beto' });
  assert.equal(s.deck.length, 33);
  assert.equal(s.seats.A.hand.length, 3);
  assert.equal(s.seats.B.hand.length, 3);
  assert.equal(s.leader, 'A'); // host leads the first trick
  assert.equal(s.turnDeadline, null); // armed by the server layer, not the engine
  assert.deepEqual(s.rematch, { A: false, B: false });
  assert.deepEqual(toSnapshot(s, 'A').rematch, { me: false, opponent: false });
});

test('toSnapshot: hides private fields, exposes only counts', () => {
  const s = createGame('normal', 'g2');
  s.tokens = { A: 'secret-a', B: 'secret-b' };
  for (const seat of ['A', 'B']) {
    const snap = toSnapshot(s, seat);
    for (const leaked of ['seats', 'deck', 'allPlayedCards', 'tokens', 'voidSuits', 'botSeat']) {
      assert.ok(!(leaked in snap), `snapshot must not contain ${leaked}`);
    }
    assert.ok(!JSON.stringify(snap).includes('secret-'), 'tokens must never serialize into a snapshot');
  }
  const snap = toSnapshot(s, 'A');
  assert.equal(snap.aiHandCount, 3);
  assert.equal(snap.deckCount, 33);
  assert.equal(snap.gameOver, null);
  assert.equal(snap.playerHand.length, 3);
  assert.equal(snap.mode, 'solo');
  assert.equal(snap.myTurn, true);
});

test('toSnapshot: seat B sees the mirrored view', () => {
  const s = createMultiplayerGame({ gameId: 'm2', hostName: 'Ana', guestName: 'Beto' });
  s.seats.A.points = 10;
  s.seats.B.points = 4;
  const a = toSnapshot(s, 'A');
  const b = toSnapshot(s, 'B');
  assert.deepEqual(a.playerHand, s.seats.A.hand);
  assert.deepEqual(b.playerHand, s.seats.B.hand);
  assert.equal(a.playerPoints, 10);
  assert.equal(b.playerPoints, 4);
  assert.equal(b.aiPoints, 10);
  assert.equal(a.playerLeads, true);
  assert.equal(b.playerLeads, false);
  assert.equal(a.myTurn, true);
  assert.equal(b.myTurn, false);
  assert.deepEqual(a.names, { me: 'Ana', opponent: 'Beto' });
  assert.deepEqual(b.names, { me: 'Beto', opponent: 'Ana' });
});

// ------------------------------------------------------------------
// symmetric half-moves via applyMove
// ------------------------------------------------------------------
test('applyMove: a lead sets pendingCard, bumps seq, resolves nothing', () => {
  const s = createMultiplayerGame({ gameId: 'hm1', hostName: 'a', guestName: 'b' });
  const card = s.seats.A.hand[1];
  const res = applyMove(s, 'A', 1);
  assert.equal(res.kind, 'led');
  assert.deepEqual(res.card, card);
  assert.deepEqual(s.pendingCard, card);
  assert.equal(s.seq, 1);
  assert.equal(s.seats.A.hand.length, 2);
  assert.equal(s.seats.A.points + s.seats.B.points, 0);
  assert.equal(actorSeat(s), 'B');
  // The leader's own snapshot shows the pending card as theirs; the follower
  // sees it as the opponent's led card.
  assert.deepEqual(toSnapshot(s, 'A').myPendingCard, card);
  assert.equal(toSnapshot(s, 'A').currentAiCard, null);
  assert.deepEqual(toSnapshot(s, 'B').currentAiCard, card);
});

test('applyMove: the response resolves the trick and the winner leads next', () => {
  const s = createMultiplayerGame({ gameId: 'hm2', hostName: 'a', guestName: 'b' });
  s.trumpSuit = 'Oros';
  s.pendingCard = null;
  s.leader = 'B'; // let B lead this trick
  s.seats.B.hand = [C(1), C(2)];
  s.seats.A.hand = [C(3), E(4)];
  s.deck = [E(5), E(6)];

  const led = applyMove(s, 'B', 0); // B leads the Copas Ace
  assert.equal(led.kind, 'led');
  const res = applyMove(s, 'A', 0); // A follows with the Copas 3... loses to the Ace
  assert.equal(res.kind, 'resolved');
  assert.equal(res.leader, 'B');
  assert.equal(res.winner, 'B');
  assert.equal(res.trickPoints, 21); // Ace 11 + three 10
  assert.equal(s.seats.B.points, 21);
  assert.equal(s.leader, 'B');
  assert.equal(s.pendingCard, null);
  // winner drew first (deck popped from the end)
  assert.deepEqual(res.draws.B, E(6));
  assert.deepEqual(res.draws.A, E(5));
  assert.deepEqual(s.seats.B.wonCards, [C(1), C(3)]);
});

test('applyMove: rejects out-of-turn and bad-index moves', () => {
  const s = createMultiplayerGame({ gameId: 'hm3', hostName: 'a', guestName: 'b' });
  assert.throws(() => applyMove(s, 'B', 0), /not this seat's turn/);
  assert.throws(() => applyMove(s, 'A', 7), /invalid card index/);
  applyMove(s, 'A', 0);
  assert.throws(() => applyMove(s, 'A', 0), /not this seat's turn/);
  s.gameActive = false;
  assert.throws(() => applyMove(s, 'B', 0), /game is not active/);
});

test('full multiplayer game: alternating applyMove ends at 120 points', () => {
  withSeed(9, () => {
    const s = createMultiplayerGame({ gameId: 'hm4', hostName: 'a', guestName: 'b' });
    let halfMoves = 0;
    while (s.gameActive) {
      const seat = actorSeat(s);
      applyMove(s, seat, 0);
      halfMoves++;
      assert.ok(halfMoves <= 40, 'game must end within 40 half-moves');
    }
    assert.equal(halfMoves, 40);
    assert.equal(s.seats.A.points + s.seats.B.points, 120);
    assert.equal(s.seats.A.hand.length, 0);
    assert.equal(s.seats.B.hand.length, 0);
    assert.equal(s.trumpTaken, true);
  });
});

// ------------------------------------------------------------------
// void inference flows through applyPlayerMove (GOTCHA #2)
// ------------------------------------------------------------------
test('applyPlayerMove: records the void when the human fails to follow the bot lead', () => {
  const s = createGame('normal', 'v');
  s.leader = 'B';
  s.pendingCard = C(7);
  s.trumpSuit = 'Oros';
  s.seats.A.hand = [E(5), { suit: 'Bastos', value: 6 }]; // no Copas → will break suit
  s.seats.B.hand = [O(2), C(1)];
  s.deck = [];
  applyPlayerMove(s, 0); // plays Espadas, not Copas
  assert.ok(s.seats.A.voidSuits.includes('Copas'));
});

// ------------------------------------------------------------------
// full-game invariants (seeded → deterministic) for every difficulty
// ------------------------------------------------------------------
function playGame(difficulty, seed) {
  return withSeed(seed, () => {
    const s = createGame(difficulty, `t-${seed}`);
    const transcript = [];
    while (s.gameActive) {
      const out = applyPlayerMove(s, 0); // human policy: always play first card
      transcript.push(`${out.playerCard.suit[0]}${out.playerCard.value}-${out.aiCard.suit[0]}${out.aiCard.value}:${out.winner[0]}`);
    }
    const p = s.seats.A.points;
    const g = s.seats.B.points;
    return { p, g, tricks: transcript.length, line: `${p}-${g}|${transcript.join(',')}` };
  });
}

for (const diff of ['easy', 'normal', 'hard']) {
  test(`full game invariants (${diff}): points sum to 120 over 20 tricks`, () => {
    for (let seed = 1; seed <= 12; seed++) {
      const r = playGame(diff, seed);
      assert.equal(r.p + r.g, 120, `${diff} seed ${seed} sum`);
      assert.equal(r.tricks, 20, `${diff} seed ${seed} tricks`);
    }
  });
}

test('full game is reproducible under a fixed seed', () => {
  assert.equal(playGame('hard', 42).line, playGame('hard', 42).line);
});

// Golden-master regression anchors: lock in the current engine + AI behavior so
// any refactor that unintentionally changes game flow is caught. Regenerate the
// transcripts deliberately when behavior is meant to change.
test('golden master: hard seed=42 transcript is stable', () => {
  // Regenerated for the determinized-search hard mode (2026-07).
  const GOLDEN = '49-71|E5-C10:p,B3-E10:p,O7-C11:p,E1-O10:a,C5-B10:a,E6-B12:a,O6-B1:p,C7-C3:a,O1-E2:p,B4-E4:p,C1-O5:a,B5-O3:a,C12-B11:a,B6-E12:a,O2-E3:p,O4-B7:p,B2-C2:p,C4-O11:a,E7-E11:a,C6-O12:a';
  assert.equal(playGame('hard', 42).line, GOLDEN);
});

test('golden master: normal seed=7 transcript is stable', () => {
  const GOLDEN = '27-93|O1-C5:a,B10-E6:a,C11-O10:p,C10-E2:p,B3-O6:p,O5-O3:a,C4-E3:p,O12-C3:a,O7-E12:a,E1-B11:a,O4-C7:a,B6-C12:a,E4-E5:a,B12-B1:a,B7-E10:a,O11-B5:a,B2-E11:a,E7-C2:a,B4-C1:a,C6-O2:p';
  assert.equal(playGame('normal', 7).line, GOLDEN);
});
