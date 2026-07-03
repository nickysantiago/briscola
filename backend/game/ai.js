// ai.js - AI opponent logic, server-side.
//
// Three difficulty levels: easy (random), normal (greedy heuristics), and hard
// (card counting, void tracking, and a perfect-information endgame minimax).
// All strategy functions read the passed-in `state` and pick a card by index;
// suit comparisons use state.trumpSuit (never state.trumpCard.suit, which is
// picked up into a hand late-game).

import { VALUE_POINTS, SUITS, VALUES } from './constants.js';
import { getCardRank } from './engine.js';

// ------------------------------------------------------------------
// Entry point used by the engine
// ------------------------------------------------------------------

// Pick the AI's card and remove it from its hand. `playerCard` is the human's
// lead when the AI is responding, or null when the AI is leading.
function chooseAiCard(state, playerCard = null) {
  if (state.aiHand.length === 0) return null;

  let idx;
  switch (state.difficulty) {
    case 'easy':
      idx = playEasyMode(state, playerCard);
      break;
    case 'normal':
      idx = playNormalMode(state, playerCard);
      break;
    case 'hard':
      idx = playHardMode(state, playerCard);
      break;
    default:
      idx = playNormalMode(state, playerCard);
  }

  return state.aiHand.splice(idx, 1)[0];
}

// ------------------------------------------------------------------
// Easy Mode - random
// ------------------------------------------------------------------
function playEasyMode(state, playerCard = null) {
  return Math.floor(Math.random() * state.aiHand.length);
}

// ------------------------------------------------------------------
// Normal Mode - strategic but not optimal
// ------------------------------------------------------------------
function playNormalMode(state, playerCard = null) {
  const aiHand = state.aiHand;
  const trumpSuit = state.trumpSuit;
  let aiCardIndex;

  if (!state.playerLeads) {
    // AI leads - plays a random card
    aiCardIndex = Math.floor(Math.random() * aiHand.length);
  } else {
    // AI responds to player's lead
    const trumpsInHand = aiHand.filter(c => c.suit === trumpSuit);
    const sameSuitCards = aiHand.filter(c => c.suit === playerCard.suit);

    if (playerCard.suit === trumpSuit && sameSuitCards.length > 0) {
      // Player played trump, try to win with higher trump or lose with lowest
      const winningTrumps = sameSuitCards.filter(c => getCardRank(c) > getCardRank(playerCard));
      if (winningTrumps.length > 0) {
        const lowestWinner = winningTrumps.reduce((lowest, current) =>
          getCardRank(current) < getCardRank(lowest) ? current : lowest, winningTrumps[0]);
        aiCardIndex = aiHand.indexOf(lowestWinner);
      } else {
        const lowestCard = sameSuitCards.reduce((lowest, current) =>
          getCardRank(current) < getCardRank(lowest) ? current : lowest, sameSuitCards[0]);
        aiCardIndex = aiHand.indexOf(lowestCard);
      }
    } else if (playerCard.suit !== trumpSuit && trumpsInHand.length > 0) {
      // Player didn't play trump, AI can win with any trump
      const lowestTrump = trumpsInHand.reduce((lowest, current) =>
        getCardRank(current) < getCardRank(lowest) ? current : lowest, trumpsInHand[0]);
      aiCardIndex = aiHand.indexOf(lowestTrump);
    } else if (sameSuitCards.length > 0) {
      // Try to win with same suit
      const winningCards = sameSuitCards.filter(c => getCardRank(c) > getCardRank(playerCard));
      if (winningCards.length > 0) {
        const lowestWinner = winningCards.reduce((lowest, current) =>
          getCardRank(current) < getCardRank(lowest) ? current : lowest, winningCards[0]);
        aiCardIndex = aiHand.indexOf(lowestWinner);
      } else {
        const lowestCard = sameSuitCards.reduce((lowest, current) =>
          getCardRank(current) < getCardRank(lowest) ? current : lowest, sameSuitCards[0]);
        aiCardIndex = aiHand.indexOf(lowestCard);
      }
    } else {
      // Can't win, throw lowest value card
      const lowestValueCard = aiHand.reduce((lowest, current) => {
        const currentPoints = VALUE_POINTS[current.value] || 0;
        const lowestPoints = VALUE_POINTS[lowest.value] || 0;
        return currentPoints < lowestPoints ? current : lowest;
      }, aiHand[0]);
      aiCardIndex = aiHand.indexOf(lowestValueCard);
    }
  }

  return aiCardIndex;
}

// ============================================================
// HARD MODE - Expert AI with card counting, void tracking,
// and perfect-information endgame solver.
// ============================================================

function cardEq(a, b) {
  return !!a && !!b && a.suit === b.suit && a.value === b.value;
}

// Build the set of cards the AI has not seen (not in its hand, not played).
function computeUnseen(state) {
  const full = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      full.push({ suit, value });
    }
  }
  return full.filter(c =>
    !state.aiHand.some(h => cardEq(h, c)) &&
    !state.allPlayedCards.some(p => cardEq(p, c))
  );
}

function playHardMode(state, playerCard = null) {
  const aiHand = state.aiHand;
  const trumpSuit = state.trumpSuit;
  const unseen = computeUnseen(state);
  const trumpsInHand = aiHand.filter(c => c.suit === trumpSuit);
  const gamePhase = state.deck.length > 15 ? 'early' : state.deck.length > 6 ? 'mid' : 'late';
  const scoreDiff = state.aiPoints - state.playerPoints;

  // ------------------------------------------------------------
  // PERFECT ENDGAME: deck empty + <=3 cards each.
  // ------------------------------------------------------------
  if (state.deck.length === 0) {
    const playerKnownHand = unseen.slice();
    if (playerKnownHand.length <= 3 && playerKnownHand.length === state.playerHand.length) {
      return solveEndgame(state, playerCard, playerKnownHand);
    }
  }

  // ================== LEADING ==================
  if (!state.playerLeads) {
    // 1. Cash a guaranteed winner.
    for (const c of aiHand) {
      if (c.suit === trumpSuit) continue;
      if (state.playerVoidSuits.includes(c.suit)) continue; // they'll trump or dump
      const higherUnseen = unseen.some(u =>
        u.suit === c.suit && getCardRank(u) > getCardRank(c)
      );
      if (!higherUnseen && (VALUE_POINTS[c.value] || 0) >= 3) {
        return aiHand.indexOf(c);
      }
    }

    // 2. If player is out of trumps entirely, cash our highest point non-trump.
    const playerTrumpsRemaining = unseen.filter(u => u.suit === trumpSuit).length;
    if (playerTrumpsRemaining === 0) {
      const best = aiHand
        .filter(c => c.suit !== trumpSuit)
        .sort((a, b) => (VALUE_POINTS[b.value] || 0) - (VALUE_POINTS[a.value] || 0))[0];
      if (best && (VALUE_POINTS[best.value] || 0) > 0) return aiHand.indexOf(best);
    }

    // 3. Bait the player into committing trumps.
    if (gamePhase === 'mid' && scoreDiff < 15 && trumpsInHand.some(t => t.value === 1 || t.value === 3)) {
      const bait = aiHand
        .filter(c => c.suit !== trumpSuit && !state.playerVoidSuits.includes(c.suit))
        .filter(c => {
          const pts = VALUE_POINTS[c.value] || 0;
          return pts >= 2 && pts <= 4; // Jacks/Kings
        })
        .sort((a, b) => (VALUE_POINTS[a.value] || 0) - (VALUE_POINTS[b.value] || 0))[0];
      if (bait) return aiHand.indexOf(bait);
    }

    // 4. Lead a low zero-point card, preferring suits the player is void in.
    const zeroPointLeads = aiHand
      .filter(c => c.suit !== trumpSuit && (VALUE_POINTS[c.value] || 0) === 0)
      .sort((a, b) => {
        const aVoid = state.playerVoidSuits.includes(a.suit) ? 1 : 0;
        const bVoid = state.playerVoidSuits.includes(b.suit) ? 1 : 0;
        if (aVoid !== bVoid) return bVoid - aVoid;
        return getCardRank(a) - getCardRank(b);
      });
    if (zeroPointLeads.length > 0) return aiHand.indexOf(zeroPointLeads[0]);

    // 5. Fallback: lowest-value, lowest-rank non-trump (avoid leading trump).
    const nonTrump = aiHand.filter(c => c.suit !== trumpSuit);
    const pool = nonTrump.length > 0 ? nonTrump : aiHand;
    const fallback = [...pool].sort((a, b) => {
      const d = (VALUE_POINTS[a.value] || 0) - (VALUE_POINTS[b.value] || 0);
      return d !== 0 ? d : getCardRank(a) - getCardRank(b);
    })[0];
    return aiHand.indexOf(fallback);
  }

  // ================== FOLLOWING ==================
  const sameSuit = aiHand.filter(c => c.suit === playerCard.suit);
  const playerPts = VALUE_POINTS[playerCard.value] || 0;

  // Helper: lowest card that beats `beat` from a set, or null.
  const lowestWinner = (cards, beat) => {
    const winners = cards.filter(c => getCardRank(c) > getCardRank(beat));
    if (!winners.length) return null;
    return winners.reduce((lo, c) => getCardRank(c) < getCardRank(lo) ? c : lo);
  };

  // Case A: Player led trump.
  if (playerCard.suit === trumpSuit) {
    const w = lowestWinner(sameSuit, playerCard);
    if (w) {
      const wRank = getCardRank(w);
      if (playerPts > 0 || wRank <= 3 || scoreDiff < -5) {
        return aiHand.indexOf(w);
      }
    }
    return indexOfCheapestDiscard(state);
  }

  // Case B: Player led a non-trump suit.
  // B1: Follow suit and beat if worth it.
  {
    const w = lowestWinner(sameSuit, playerCard);
    if (w) {
      const wRank = getCardRank(w);
      if (playerPts > 0 || wRank <= 2 || scoreDiff < -5) {
        return aiHand.indexOf(w);
      }
    }
  }

  // B2: Consider trumping.
  if (trumpsInHand.length > 0) {
    const lowestTrump = trumpsInHand.reduce(
      (lo, c) => getCardRank(c) < getCardRank(lo) ? c : lo
    );
    const lowTrumpRank = getCardRank(lowestTrump);

    const shouldTrump =
      playerPts >= 10 ||
      (playerPts >= 2 && (gamePhase !== 'early' || scoreDiff < -5)) ||
      (playerPts === 0 && gamePhase === 'late' && trumpsInHand.length >= 2 && lowTrumpRank <= 3);

    if (shouldTrump) {
      return aiHand.indexOf(lowestTrump);
    }
  }

  // B3: Not winning. Dump cheapest same-suit, else cheapest overall.
  if (sameSuit.length > 0) {
    const cheapest = sameSuit.reduce((lo, c) => {
      const lp = VALUE_POINTS[lo.value] || 0;
      const cp = VALUE_POINTS[c.value] || 0;
      if (cp !== lp) return cp < lp ? c : lo;
      return getCardRank(c) < getCardRank(lo) ? c : lo;
    });
    return aiHand.indexOf(cheapest);
  }

  return indexOfCheapestDiscard(state);
}

// Dump cheapest card, preferring suits the player is void in and avoiding trump Ace/Three.
function indexOfCheapestDiscard(state) {
  const aiHand = state.aiHand;
  const trumpSuit = state.trumpSuit;
  const candidates = aiHand.filter(c =>
    !(c.suit === trumpSuit && (c.value === 1 || c.value === 3))
  );
  const pool = candidates.length > 0 ? candidates : aiHand;
  const sorted = [...pool].sort((a, b) => {
    const va = VALUE_POINTS[a.value] || 0;
    const vb = VALUE_POINTS[b.value] || 0;
    if (va !== vb) return va - vb;
    const aVoid = state.playerVoidSuits.includes(a.suit) ? 1 : 0;
    const bVoid = state.playerVoidSuits.includes(b.suit) ? 1 : 0;
    if (aVoid !== bVoid) return bVoid - aVoid;
    const aTrump = a.suit === trumpSuit ? 1 : 0;
    const bTrump = b.suit === trumpSuit ? 1 : 0;
    if (aTrump !== bTrump) return aTrump - bTrump;
    return getCardRank(a) - getCardRank(b);
  });
  return aiHand.indexOf(sorted[0]);
}

// ============================================================
// ENDGAME MINIMAX
// Called only when deck is empty and playerKnownHand.length <= 3.
// Objective: maximize (final AI points - final player points).
// Returns the index in state.aiHand of the optimal play.
// ============================================================
function solveEndgame(state, playerCard, playerKnownHand) {
  const trumpSuit = state.trumpSuit;
  const aiHand = state.aiHand;

  function resolveTrick(pCard, aCard, leader) {
    const leadSuit = leader === 'player' ? pCard.suit : aCard.suit;
    const pTrump = pCard.suit === trumpSuit;
    const aTrump = aCard.suit === trumpSuit;
    if (pTrump && aTrump) {
      return getCardRank(pCard) > getCardRank(aCard) ? 'player' : 'ai';
    }
    if (pTrump) return 'player';
    if (aTrump) return 'ai';
    if (leader === 'player') {
      if (aCard.suit === leadSuit) {
        return getCardRank(pCard) > getCardRank(aCard) ? 'player' : 'ai';
      }
      return 'player';
    } else {
      if (pCard.suit === leadSuit) {
        return getCardRank(pCard) > getCardRank(aCard) ? 'player' : 'ai';
      }
      return 'ai';
    }
  }

  function search(aiCards, playerCards, leads, pending) {
    if (!pending && aiCards.length === 0 && playerCards.length === 0) return 0;

    if (!pending) {
      if (leads === 'ai') {
        let best = -Infinity;
        for (const c of aiCards) {
          const v = search(aiCards.filter(x => x !== c), playerCards, 'player', { card: c, leader: 'ai' });
          if (v > best) best = v;
        }
        return best;
      } else {
        let worst = Infinity;
        for (const c of playerCards) {
          const v = search(aiCards, playerCards.filter(x => x !== c), 'ai', { card: c, leader: 'player' });
          if (v < worst) worst = v;
        }
        return worst;
      }
    }

    const responder = pending.leader === 'ai' ? 'player' : 'ai';
    if (responder === 'ai') {
      let best = -Infinity;
      for (const c of aiCards) {
        const winner = resolveTrick(pending.card, c, pending.leader);
        const pts = (VALUE_POINTS[pending.card.value] || 0) + (VALUE_POINTS[c.value] || 0);
        const delta = winner === 'ai' ? pts : -pts;
        const v = delta + search(aiCards.filter(x => x !== c), playerCards, winner, null);
        if (v > best) best = v;
      }
      return best;
    } else {
      let worst = Infinity;
      for (const c of playerCards) {
        const winner = resolveTrick(c, pending.card, pending.leader);
        const pts = (VALUE_POINTS[pending.card.value] || 0) + (VALUE_POINTS[c.value] || 0);
        const delta = winner === 'ai' ? pts : -pts;
        const v = delta + search(aiCards, playerCards.filter(x => x !== c), winner, null);
        if (v < worst) worst = v;
      }
      return worst;
    }
  }

  if (playerCard) {
    // AI is responding to player's lead.
    const playerCardsRemaining = playerKnownHand.filter(x => !cardEq(x, playerCard));
    let best = -Infinity;
    let bestIdx = 0;
    for (let i = 0; i < aiHand.length; i++) {
      const c = aiHand[i];
      const winner = resolveTrick(playerCard, c, 'player');
      const pts = (VALUE_POINTS[playerCard.value] || 0) + (VALUE_POINTS[c.value] || 0);
      const delta = winner === 'ai' ? pts : -pts;
      const v = delta + search(aiHand.filter((_, j) => j !== i), playerCardsRemaining, winner, null);
      if (v > best) { best = v; bestIdx = i; }
    }
    return bestIdx;
  } else {
    // AI is leading.
    let best = -Infinity;
    let bestIdx = 0;
    for (let i = 0; i < aiHand.length; i++) {
      const c = aiHand[i];
      const v = search(aiHand.filter((_, j) => j !== i), playerKnownHand, 'player', { card: c, leader: 'ai' });
      if (v > best) { best = v; bestIdx = i; }
    }
    return bestIdx;
  }
}

export {
  chooseAiCard,
  playHardMode,
  computeUnseen,
  solveEndgame
};
