// Engine rules tests + full-game invariants + golden-master regression anchors.
// Run with: node --test   (from the backend/ directory)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  determineWinner,
  drawLogic,
  applyPlayerMove,
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

// ------------------------------------------------------------------
// determineWinner
// ------------------------------------------------------------------
test('determineWinner: both trump → higher rank wins', () => {
  const s = { trumpSuit: 'Oros', playerLeads: true };
  assert.equal(determineWinner(s, O(1), O(3)), 'player'); // Ace(9) > 3(8)
  assert.equal(determineWinner(s, O(3), O(1)), 'ai');
});

test('determineWinner: only one side trumps', () => {
  const s = { trumpSuit: 'Oros', playerLeads: true };
  assert.equal(determineWinner(s, O(2), C(1)), 'player'); // player trumps a non-trump Ace
  assert.equal(determineWinner(s, C(1), O(2)), 'ai');     // AI trumps
});

test('determineWinner: no trump, player leads', () => {
  const s = { trumpSuit: 'Oros', playerLeads: true };
  assert.equal(determineWinner(s, C(5), C(1)), 'ai');     // AI follows higher
  assert.equal(determineWinner(s, C(1), C(5)), 'player');  // player higher
  assert.equal(determineWinner(s, C(5), E(1)), 'player');  // AI off-suit, no trump
});

test('determineWinner: no trump, AI leads', () => {
  const s = { trumpSuit: 'Oros', playerLeads: false };
  assert.equal(determineWinner(s, C(1), C(5)), 'player');  // player follows higher
  assert.equal(determineWinner(s, E(1), C(5)), 'ai');     // player off-suit, no trump
});

// ------------------------------------------------------------------
// drawLogic (the famous deck===1 trump pickup, GOTCHA #1)
// ------------------------------------------------------------------
test('drawLogic: deck>=2, winner (player) draws first', () => {
  const top = C(7), next = E(6);
  const s = { deck: [E(2), next, top], playerHand: [], aiHand: [], trumpCard: O(5), trumpTaken: false };
  const r = drawLogic(s, 'player');
  assert.deepEqual(s.playerHand[0], top);   // winner gets the popped (last) card first
  assert.deepEqual(s.aiHand[0], next);
  assert.equal(r.aiDrew, true);
  assert.equal(r.trumpPickedUp, false);
  assert.equal(s.deck.length, 1);
});

test('drawLogic: deck===1, player won → player draws last card, AI picks up trump', () => {
  const last = C(7), trump = O(5);
  const s = { deck: [last], playerHand: [], aiHand: [], trumpCard: trump, trumpTaken: false };
  const r = drawLogic(s, 'player');
  assert.deepEqual(s.playerHand[0], last);
  assert.deepEqual(s.aiHand[0], trump);
  assert.equal(s.trumpTaken, true);
  assert.equal(r.trumpPickedUp, true);
  assert.equal(s.deck.length, 0);
});

test('drawLogic: deck===1, AI won → AI draws last card, player picks up trump', () => {
  const last = C(7), trump = O(5);
  const s = { deck: [last], playerHand: [], aiHand: [], trumpCard: trump, trumpTaken: false };
  const r = drawLogic(s, 'ai');
  assert.deepEqual(s.aiHand[0], last);
  assert.deepEqual(s.playerHand[0], trump);
  assert.equal(s.trumpTaken, true);
  assert.deepEqual(r.player, trump); // the human's pickup is reported (it's their own card)
});

test('drawLogic: deck empty → no draws', () => {
  const s = { deck: [], playerHand: [], aiHand: [], trumpCard: O(5), trumpTaken: true };
  const r = drawLogic(s, 'player');
  assert.equal(r.player, null);
  assert.equal(r.aiDrew, false);
  assert.equal(s.playerHand.length, 0);
});

// ------------------------------------------------------------------
// createGame / toSnapshot
// ------------------------------------------------------------------
test('createGame: initial invariants', () => {
  const s = createGame('hard', 'g1');
  assert.equal(s.deck.length, 33);          // 40 - 6 dealt - 1 trump
  assert.equal(s.playerHand.length, 3);
  assert.equal(s.aiHand.length, 3);
  assert.ok(s.trumpCard);
  assert.equal(s.trumpSuit, s.trumpCard.suit);
  assert.equal(s.trumpTaken, false);
  assert.equal(s.playerLeads, true);
  assert.equal(s.gameActive, true);
  assert.equal(s.seq, 0);
  assert.deepEqual(s.playerVoidSuits, []);
  assert.equal(s.difficulty, 'hard');
});

test('createGame: unknown difficulty defaults to normal', () => {
  assert.equal(createGame('impossible', 'g').difficulty, 'normal');
});

test('toSnapshot: hides private fields, exposes only counts', () => {
  const s = createGame('normal', 'g2');
  const snap = toSnapshot(s);
  for (const leaked of ['aiHand', 'deck', 'allPlayedCards', 'playerVoidSuits']) {
    assert.ok(!(leaked in snap), `snapshot must not contain ${leaked}`);
  }
  assert.equal(snap.aiHandCount, 3);
  assert.equal(snap.deckCount, 33);
  assert.equal(snap.gameOver, null);
  assert.equal(snap.playerHand.length, 3);
});

// ------------------------------------------------------------------
// void inference flows through applyPlayerMove (GOTCHA #2)
// ------------------------------------------------------------------
test('applyPlayerMove: records player void when they fail to follow the AI lead', () => {
  const s = createGame('normal', 'v');
  s.playerLeads = false;
  s.currentAiCard = C(7);
  s.trumpSuit = 'Oros';
  s.playerHand = [E(5), { suit: 'Bastos', value: 6 }]; // no Copas → will break suit
  s.aiHand = [O(2), C(1)];
  s.deck = [];
  applyPlayerMove(s, 0); // plays Espadas, not Copas
  assert.ok(s.playerVoidSuits.includes('Copas'));
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
    return { p: s.playerPoints, g: s.aiPoints, tricks: transcript.length, line: `${s.playerPoints}-${s.aiPoints}|${transcript.join(',')}` };
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
  const GOLDEN = '59-61|E5-C10:p,B3-B12:p,O7-O10:a,E1-E6:p,C5-C11:a,B10-E10:a,O11-B1:p,C7-C3:a,O1-E2:p,B4-E4:p,C1-O5:a,B5-B11:a,C12-E3:a,B6-E12:a,O2-E11:p,O4-O6:a,B2-B7:a,C4-O3:a,C2-E7:a,O12-C6:p';
  assert.equal(playGame('hard', 42).line, GOLDEN);
});

test('golden master: normal seed=7 transcript is stable', () => {
  const GOLDEN = '27-93|O1-C5:a,B10-E6:a,C11-O10:p,C10-E2:p,B3-O6:p,O5-O3:a,C4-E3:p,O12-C3:a,O7-E12:a,E1-B11:a,O4-C7:a,B6-C12:a,E4-E5:a,B12-B1:a,B7-E10:a,O11-B5:a,B2-E11:a,E7-C2:a,B4-C1:a,C6-O2:p';
  assert.equal(playGame('normal', 7).line, GOLDEN);
});
