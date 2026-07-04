// AI strategy tests. These exercise the deterministic parts of the AI (hard mode
// and the endgame solver) with hand-constructed states. Run with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playHardMode, solveEndgame, computeUnseen } from '../game/ai.js';
import { SUITS, VALUES } from '../game/constants.js';

function allCards() {
  const all = [];
  for (const suit of SUITS) {
    for (const value of VALUES) all.push({ suit, value });
  }
  return all;
}

test('hard mode: trumps a high-point lead (Ace) when following', () => {
  const s = {
    trumpSuit: 'Oros',
    playerLeads: true, // human led → AI is following
    aiHand: [{ suit: 'Oros', value: 4 }, { suit: 'Copas', value: 12 }],
    deck: Array.from({ length: 20 }, () => ({ suit: 'Bastos', value: 2 })),
    aiPoints: 0,
    playerPoints: 0,
    allPlayedCards: [],
    playerVoidSuits: [],
    playerHand: [{ suit: 'Copas', value: 3 }]
  };
  const idx = playHardMode(s, { suit: 'Copas', value: 1 }); // Ace of Copas (11 pts)
  assert.deepEqual(s.aiHand[idx], { suit: 'Oros', value: 4 }); // spends the low trump
});

test('hard mode: discards cheap (does NOT trump) a zero-point lead in the early game', () => {
  const s = {
    trumpSuit: 'Oros',
    playerLeads: true,
    aiHand: [{ suit: 'Oros', value: 1 }, { suit: 'Copas', value: 2 }], // trump Ace + junk
    deck: Array.from({ length: 25 }, () => ({ suit: 'Bastos', value: 2 })), // early game
    aiPoints: 0,
    playerPoints: 0,
    allPlayedCards: [],
    playerVoidSuits: [],
    playerHand: [{ suit: 'Espadas', value: 4 }]
  };
  const idx = playHardMode(s, { suit: 'Espadas', value: 5 }); // 0-point lead
  assert.deepEqual(s.aiHand[idx], { suit: 'Copas', value: 2 }); // saves the trump Ace
});

test('hard mode: delegates to the endgame solver when deck empty and hand fully known', () => {
  const all = allCards();
  const aiHand = [all[0], all[1]];     // 2 cards
  const playerHand = [all[2], all[3]];  // 2 cards
  const played = all.slice(4);          // the other 36 are accounted for
  const s = {
    trumpSuit: 'Oros',
    playerLeads: false, // AI is leading
    deck: [],
    aiHand,
    playerHand,
    aiPoints: 0,
    playerPoints: 0,
    allPlayedCards: played,
    playerVoidSuits: []
  };
  const unseen = computeUnseen(s);
  assert.equal(unseen.length, 2, 'unseen must equal the real player hand');
  const expected = solveEndgame(s, null, unseen.slice());
  const got = playHardMode(s, null);
  assert.equal(got, expected, 'playHardMode must return the solver result at the endgame');
});

test('solveEndgame: a single forced trump win returns the only index', () => {
  const s = { trumpSuit: 'Oros', aiHand: [{ suit: 'Oros', value: 1 }] };
  assert.equal(solveEndgame(s, null, [{ suit: 'Copas', value: 1 }]), 0);
});

test('solveEndgame: when responding, grabs the trick it can win for points', () => {
  // AI responds to player's Ace-of-Copas lead (11 pts). AI holds the trump 2
  // (can win the 11) and a junk card. Winning nets +11 and keeps the lead.
  const s = {
    trumpSuit: 'Oros',
    aiHand: [{ suit: 'Bastos', value: 2 }, { suit: 'Oros', value: 2 }]
  };
  const playerCard = { suit: 'Copas', value: 1 };
  const playerKnownHand = [playerCard, { suit: 'Bastos', value: 4 }];
  const idx = solveEndgame(s, playerCard, playerKnownHand);
  assert.deepEqual(s.aiHand[idx], { suit: 'Oros', value: 2 }); // trump to capture the Ace
});

test('computeUnseen: excludes the AI hand and all played cards', () => {
  const s = {
    aiHand: [{ suit: 'Oros', value: 1 }],
    allPlayedCards: [{ suit: 'Copas', value: 1 }, { suit: 'Espadas', value: 7 }]
  };
  const unseen = computeUnseen(s);
  assert.equal(unseen.length, 40 - 1 - 2);
  assert.ok(!unseen.some(c => c.suit === 'Oros' && c.value === 1));
  assert.ok(!unseen.some(c => c.suit === 'Copas' && c.value === 1));
});
