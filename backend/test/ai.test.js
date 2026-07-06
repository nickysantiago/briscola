// AI strategy tests. These exercise the deterministic parts of the AI (hard mode
// and the endgame solver) with hand-constructed states. Run with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { playHardMode, solveEndgame, computeUnseen } from '../game/ai.js';
import { createGame, applyPlayerMove } from '../game/engine.js';
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

test('hard mode: deterministic — the same position always yields the same move', () => {
  const make = () => ({
    trumpSuit: 'Espadas',
    playerLeads: false, // AI leads
    aiHand: [{ suit: 'Oros', value: 7 }, { suit: 'Copas', value: 11 }, { suit: 'Espadas', value: 4 }],
    deck: Array.from({ length: 21 }, () => ({ suit: 'Bastos', value: 2 })),
    trumpCard: { suit: 'Espadas', value: 6 },
    trumpTaken: false,
    aiPoints: 12,
    playerPoints: 20,
    allPlayedCards: [{ suit: 'Oros', value: 2 }, { suit: 'Bastos', value: 10 }],
    playerVoidSuits: ['Copas'],
    playerHand: [{}, {}, {}]
  });
  assert.equal(playHardMode(make(), null), playHardMode(make(), null));
});

test('hard mode: uses the endgame solver when RESPONDING with the deck empty', () => {
  // Deck empty and card counting pins the player's remaining cards, including
  // the card they just led. The choice must match the exact solver's.
  const all = allCards();
  const aiHand = [all[10], all[11]];              // 2 cards
  const playerLed = all[12];
  const playerHolds = [all[13]];                  // 1 card left in hand
  const played = all.filter((_, i) => i !== 10 && i !== 11 && i !== 12 && i !== 13);
  const s = {
    trumpSuit: 'Oros',
    playerLeads: true, // human led → AI responds
    deck: [],
    trumpTaken: true,
    aiHand,
    playerHand: playerHolds,
    aiPoints: 30,
    playerPoints: 40,
    allPlayedCards: played,
    playerVoidSuits: []
  };
  const expected = solveEndgame(s, playerLed, [playerLed, ...playerHolds]);
  assert.equal(playHardMode(s, playerLed), expected);
});

test('hard mode: knows the player holds the picked-up trump in the endgame', () => {
  // The player lost the deck===1 trick and picked up the trump Ace of Oros —
  // a fact the AI can deduce. AI leads holding the Copas Ace and the trump 3.
  // Leading the trump 3 walks into the player's trump Ace (it loses 21 and
  // then the Copas Ace too: -32). Leading the Copas Ace is optimal (-12).
  const all = allCards();
  const aiHand = [{ suit: 'Copas', value: 1 }, { suit: 'Oros', value: 3 }];
  const playerHand = [{ suit: 'Oros', value: 1 }, { suit: 'Bastos', value: 2 }];
  const inPlay = [...aiHand, ...playerHand];
  const played = all.filter(c => !inPlay.some(h => h.suit === c.suit && h.value === c.value));
  const s = {
    trumpSuit: 'Oros',
    playerLeads: false, // AI leads
    deck: [],
    trumpCard: { suit: 'Oros', value: 1 },
    trumpTaken: true,
    aiHand,
    playerHand,
    aiPoints: 0,
    playerPoints: 0,
    allPlayedCards: played,
    playerVoidSuits: []
  };
  const idx = playHardMode(s, null);
  assert.deepEqual(s.aiHand[idx], { suit: 'Copas', value: 1 });
});

test('hard mode: full games against a random player complete legally', () => {
  for (let g = 0; g < 3; g++) {
    const s = createGame('hard', `fuzz-${g}`);
    let tricks = 0;
    while (s.gameActive) {
      const idx = Math.floor(Math.random() * s.seats.A.hand.length);
      applyPlayerMove(s, idx);
      tricks++;
      assert.ok(tricks <= 20, 'game must end within 20 tricks');
    }
    assert.equal(s.seats.A.points + s.seats.B.points, 120, 'all 120 points accounted for');
  }
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
