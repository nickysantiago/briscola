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
  assert.equal(determineWinner(s, O(3), O(1)), 'gpt');
});

test('determineWinner: only one side trumps', () => {
  const s = { trumpSuit: 'Oros', playerLeads: true };
  assert.equal(determineWinner(s, O(2), C(1)), 'player'); // player trumps a non-trump Ace
  assert.equal(determineWinner(s, C(1), O(2)), 'gpt');     // gpt trumps
});

test('determineWinner: no trump, player leads', () => {
  const s = { trumpSuit: 'Oros', playerLeads: true };
  assert.equal(determineWinner(s, C(5), C(1)), 'gpt');     // gpt follows higher
  assert.equal(determineWinner(s, C(1), C(5)), 'player');  // player higher
  assert.equal(determineWinner(s, C(5), E(1)), 'player');  // gpt off-suit, no trump
});

test('determineWinner: no trump, gpt leads', () => {
  const s = { trumpSuit: 'Oros', playerLeads: false };
  assert.equal(determineWinner(s, C(1), C(5)), 'player');  // player follows higher
  assert.equal(determineWinner(s, E(1), C(5)), 'gpt');     // player off-suit, no trump
});

// ------------------------------------------------------------------
// drawLogic (the famous deck===1 trump pickup, GOTCHA #1)
// ------------------------------------------------------------------
test('drawLogic: deck>=2, winner (player) draws first', () => {
  const top = C(7), next = E(6);
  const s = { deck: [E(2), next, top], playerHand: [], gptHand: [], trumpCard: O(5), trumpTaken: false };
  const r = drawLogic(s, 'player');
  assert.deepEqual(s.playerHand[0], top);   // winner gets the popped (last) card first
  assert.deepEqual(s.gptHand[0], next);
  assert.equal(r.gptDrew, true);
  assert.equal(r.trumpPickedUp, false);
  assert.equal(s.deck.length, 1);
});

test('drawLogic: deck===1, player won → player draws last card, gpt picks up trump', () => {
  const last = C(7), trump = O(5);
  const s = { deck: [last], playerHand: [], gptHand: [], trumpCard: trump, trumpTaken: false };
  const r = drawLogic(s, 'player');
  assert.deepEqual(s.playerHand[0], last);
  assert.deepEqual(s.gptHand[0], trump);
  assert.equal(s.trumpTaken, true);
  assert.equal(r.trumpPickedUp, true);
  assert.equal(s.deck.length, 0);
});

test('drawLogic: deck===1, gpt won → gpt draws last card, player picks up trump', () => {
  const last = C(7), trump = O(5);
  const s = { deck: [last], playerHand: [], gptHand: [], trumpCard: trump, trumpTaken: false };
  const r = drawLogic(s, 'gpt');
  assert.deepEqual(s.gptHand[0], last);
  assert.deepEqual(s.playerHand[0], trump);
  assert.equal(s.trumpTaken, true);
  assert.deepEqual(r.player, trump); // the human's pickup is reported (it's their own card)
});

test('drawLogic: deck empty → no draws', () => {
  const s = { deck: [], playerHand: [], gptHand: [], trumpCard: O(5), trumpTaken: true };
  const r = drawLogic(s, 'player');
  assert.equal(r.player, null);
  assert.equal(r.gptDrew, false);
  assert.equal(s.playerHand.length, 0);
});

// ------------------------------------------------------------------
// createGame / toSnapshot
// ------------------------------------------------------------------
test('createGame: initial invariants', () => {
  const s = createGame('hard', 'g1');
  assert.equal(s.deck.length, 33);          // 40 - 6 dealt - 1 trump
  assert.equal(s.playerHand.length, 3);
  assert.equal(s.gptHand.length, 3);
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
  for (const leaked of ['gptHand', 'deck', 'allPlayedCards', 'playerVoidSuits']) {
    assert.ok(!(leaked in snap), `snapshot must not contain ${leaked}`);
  }
  assert.equal(snap.gptHandCount, 3);
  assert.equal(snap.deckCount, 33);
  assert.equal(snap.gameOver, null);
  assert.equal(snap.playerHand.length, 3);
});

// ------------------------------------------------------------------
// void inference flows through applyPlayerMove (GOTCHA #2)
// ------------------------------------------------------------------
test('applyPlayerMove: records player void when they fail to follow the GPT lead', () => {
  const s = createGame('normal', 'v');
  s.playerLeads = false;
  s.currentGptCard = C(7);
  s.trumpSuit = 'Oros';
  s.playerHand = [E(5), { suit: 'Bastos', value: 6 }]; // no Copas → will break suit
  s.gptHand = [O(2), C(1)];
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
      transcript.push(`${out.playerCard.suit[0]}${out.playerCard.value}-${out.gptCard.suit[0]}${out.gptCard.value}:${out.winner[0]}`);
    }
    return { p: s.playerPoints, g: s.gptPoints, tricks: transcript.length, line: `${s.playerPoints}-${s.gptPoints}|${transcript.join(',')}` };
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

// Golden-master regression anchors: locks in the CURRENT ported behavior so the
// upcoming Fisher-Yates shuffle change (or any future refactor) is caught.
test('golden master: hard seed=42 transcript is stable', () => {
  const GOLDEN = '39-81|O11-O6:p,B4-E7:p,C7-C11:g,B2-E2:p,B12-E4:p,E12-E11:p,E5-O5:p,C12-O2:p,C3-C4:p,O4-O10:g,C1-E6:g,E3-C6:g,O12-E10:g,C5-O3:g,C2-B11:g,B5-O7:p,C10-B6:g,E1-B3:g,B10-B1:g,B7-O1:p';
  assert.equal(playGame('hard', 42).line, GOLDEN);
});

test('golden master: normal seed=7 transcript is stable', () => {
  const GOLDEN = '21-99|B4-E4:g,E6-E1:g,E11-E12:g,C4-C3:g,E7-B1:p,C10-E2:g,C2-O12:g,O4-C5:g,B2-O6:g,B12-E10:g,O10-E5:g,B6-B3:g,O11-O3:g,B5-O2:g,B10-C12:g,O7-C7:g,C11-O1:g,B11-C6:g,C1-O5:g,E3-B7:p';
  assert.equal(playGame('normal', 7).line, GOLDEN);
});
