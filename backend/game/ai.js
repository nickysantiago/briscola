// ai.js - AI opponent logic, server-side.
//
// Three difficulty levels: easy (random), normal (greedy heuristics), and hard
// (determinized Monte-Carlo search over the unseen cards, with exact
// perfect-information solving of the whole deck-empty endgame).
// All strategy functions read the passed-in `state` and pick a card by index;
// suit comparisons use state.trumpSuit (never state.trumpCard.suit, which is
// picked up into a hand late-game).
//
// Hard mode never reads state.playerHand contents or state.deck order — only
// their lengths. It infers everything else from its own hand, the play history
// and the face-up trump, so it is strong but does not cheat.

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
// HARD MODE - Expert AI.
//
// Architecture: determinized search ("Perfect Information Monte Carlo").
//   1. Deck empty: the player's exact hand is deducible from card counting,
//      so the remainder is solved exactly with alpha-beta minimax.
//   2. Deck <= 7: every player hand the unseen cards allow is enumerated
//      (deck order exact when deck <= 3, sampled otherwise) and each world is
//      solved to the end of the game; the best weighted average wins.
//   3. Otherwise: many random worlds consistent with everything the AI has
//      seen are sampled; each is solved with depth-limited alpha-beta and a
//      hand-potential evaluation at the horizon. Worlds that give the player
//      cards in suits they've shown void are down-weighted.
//
// The search models the real rules exactly: draw order (trick winner draws
// first), the face-up trump being picked up by the LOSER of the deck===1
// trick, and a win-aware objective (crossing 61 points beats margin).
// Sampling uses an RNG seeded from the position, so the choice is
// deterministic for a given state.
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

// ---------- Card <-> integer encoding for the search core ----------
// id = suitIndex * 10 + valueIndex; lookups below avoid object churn in the
// inner loops.
const N_VALUES = VALUES.length;
const N_IDS = SUITS.length * N_VALUES;
const SUIT_IDX = new Map(SUITS.map((s, i) => [s, i]));
const VALUE_IDX = new Map(VALUES.map((v, i) => [v, i]));
const ID_PTS = new Int8Array(N_IDS);
const ID_RANK = new Int8Array(N_IDS);
const ID_SUIT = new Int8Array(N_IDS);
for (let s = 0; s < SUITS.length; s++) {
  for (let vi = 0; vi < N_VALUES; vi++) {
    const id = s * N_VALUES + vi;
    ID_PTS[id] = VALUE_POINTS[VALUES[vi]] || 0;
    ID_RANK[id] = getCardRank({ value: VALUES[vi] });
    ID_SUIT[id] = s;
  }
}

function toId(card) {
  return SUIT_IDX.get(card.suit) * N_VALUES + VALUE_IDX.get(card.value);
}

const INF = 1e9;
// Added to a terminal value when the AI ends ahead (subtracted when behind):
// winning the game dominates any point margin, since margins never exceed 120.
const WIN_BONUS = 300;

// True if the led card wins against the response.
function leaderWinsTrick(lead, follow, trumpS) {
  if (ID_SUIT[lead] === ID_SUIT[follow]) return ID_RANK[lead] > ID_RANK[follow];
  return ID_SUIT[follow] !== trumpS;
}

function removeAt(arr, i) {
  const out = arr.slice();
  out.splice(i, 1);
  return out;
}

// Horizon evaluation of unresolved hands: points still held are partial value,
// trumps carry capture potential roughly proportional to their rank.
function handPotential(id, trumpS) {
  if (ID_SUIT[id] === trumpS) return ID_PTS[id] * 0.75 + ID_RANK[id] * 0.5 + 1.5;
  return ID_PTS[id] * 0.45 + ID_RANK[id] * 0.05;
}

function evalHands(aiHand, pHand, trumpS) {
  let v = 0;
  for (let i = 0; i < aiHand.length; i++) v += handPotential(aiHand[i], trumpS);
  for (let i = 0; i < pHand.length; i++) v -= handPotential(pHand[i], trumpS);
  return v;
}

// Post-trick draws, mirroring engine drawLogic: the winner draws first from the
// top of the deck (deck[deckLen - 1]); on the last deck card the loser picks up
// the face-up trump. Returns [newAiHand, newPlayerHand, newDeckLen, newFaceUpTrump].
function drawAfterTrick(aiRest, pRest, deck, deckLen, faceUpTrump, aiWins) {
  if (deckLen >= 2) {
    const first = deck[deckLen - 1];
    const second = deck[deckLen - 2];
    return [
      aiRest.concat(aiWins ? first : second),
      pRest.concat(aiWins ? second : first),
      deckLen - 2,
      faceUpTrump
    ];
  }
  if (deckLen === 1) {
    const last = deck[0];
    if (faceUpTrump >= 0) {
      return [
        aiRest.concat(aiWins ? last : faceUpTrump),
        pRest.concat(aiWins ? faceUpTrump : last),
        0,
        -1
      ];
    }
    return [
      aiWins ? aiRest.concat(last) : aiRest,
      aiWins ? pRest : pRest.concat(last),
      0,
      -1
    ];
  }
  return [aiRest, pRest, 0, faceUpTrump];
}

// Alpha-beta over one fully determinized world. Hands and deck are id arrays;
// the deck's live portion is deck[0..deckLen-1] with the top at deckLen-1.
// Returns the future point delta (AI minus player) achievable from here, plus
// WIN_BONUS at true terminals judged on curDiff (the real running score diff).
function searchTricks(aiHand, pHand, deck, deckLen, faceUpTrump, aiLeads, tricksLeft, curDiff, trumpS, alpha, beta) {
  if (aiHand.length === 0 || pHand.length === 0) {
    if (aiHand.length === 0 && pHand.length === 0) {
      return curDiff > 0 ? WIN_BONUS : curDiff < 0 ? -WIN_BONUS : 0;
    }
    return evalHands(aiHand, pHand, trumpS);
  }
  if (tricksLeft <= 0) return evalHands(aiHand, pHand, trumpS);

  const leadHand = aiLeads ? aiHand : pHand;
  const follHand = aiLeads ? pHand : aiHand;
  let best = aiLeads ? -INF : INF;

  for (let li = 0; li < leadHand.length; li++) {
    const lead = leadHand[li];
    const leadRest = removeAt(leadHand, li);

    // Responder plays against the committed lead (opposite optimizer).
    let inner = aiLeads ? INF : -INF;
    let ia = alpha;
    let ib = beta;
    for (let fi = 0; fi < follHand.length; fi++) {
      const foll = follHand[fi];
      const follRest = removeAt(follHand, fi);
      const aiWins = leaderWinsTrick(lead, foll, trumpS) === aiLeads;
      const pts = ID_PTS[lead] + ID_PTS[foll];
      const d = aiWins ? pts : -pts;
      const [nAi, nP, nDeckLen, nTrump] = drawAfterTrick(
        aiLeads ? leadRest : follRest,
        aiLeads ? follRest : leadRest,
        deck, deckLen, faceUpTrump, aiWins
      );
      const v = d + searchTricks(nAi, nP, deck, nDeckLen, nTrump, aiWins,
        tricksLeft - 1, curDiff + d, trumpS, ia - d, ib - d);
      if (aiLeads) {
        if (v < inner) inner = v;
        if (inner < ib) ib = inner;
      } else {
        if (v > inner) inner = v;
        if (inner > ia) ia = inner;
      }
      if (ia >= ib) break;
    }

    if (aiLeads) {
      if (inner > best) best = inner;
      if (best > alpha) alpha = best;
    } else {
      if (inner < best) best = inner;
      if (best < beta) beta = best;
    }
    if (alpha >= beta) break;
  }
  return best;
}

// Value of the AI playing aiIds[moveIdx] as the very next card in one world.
// playerCardId >= 0 means the player has already led that card.
function rootMoveValue(aiIds, moveIdx, pHand, deck, deckLen, faceUpTrump, playerCardId, depth, curDiff, trumpS) {
  const c = aiIds[moveIdx];
  const aiRest = removeAt(aiIds, moveIdx);

  if (playerCardId >= 0) {
    const aiWins = !leaderWinsTrick(playerCardId, c, trumpS);
    const pts = ID_PTS[playerCardId] + ID_PTS[c];
    const d = aiWins ? pts : -pts;
    const [nAi, nP, nDeckLen, nTrump] = drawAfterTrick(aiRest, pHand, deck, deckLen, faceUpTrump, aiWins);
    return d + searchTricks(nAi, nP, deck, nDeckLen, nTrump, aiWins,
      depth - 1, curDiff + d, trumpS, -INF, INF);
  }

  // AI leads c; the player responds adversarially within this world.
  if (pHand.length === 0) return evalHands(aiRest, pHand, trumpS);
  let worst = INF;
  for (let fi = 0; fi < pHand.length; fi++) {
    const foll = pHand[fi];
    const pRest = removeAt(pHand, fi);
    const aiWins = leaderWinsTrick(c, foll, trumpS);
    const pts = ID_PTS[c] + ID_PTS[foll];
    const d = aiWins ? pts : -pts;
    const [nAi, nP, nDeckLen, nTrump] = drawAfterTrick(aiRest, pRest, deck, deckLen, faceUpTrump, aiWins);
    const v = d + searchTricks(nAi, nP, deck, nDeckLen, nTrump, aiWins,
      depth - 1, curDiff + d, trumpS, -INF, worst - d);
    if (v < worst) worst = v;
  }
  return worst;
}

// ---------- Deterministic sampling ----------

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a over the decision-relevant state, so the same position always
// produces the same sample set (and therefore the same move).
function stateSeed(state, playerCardId) {
  let h = 0x811c9dc5;
  const mix = (n) => {
    h = Math.imul(h ^ (n & 0xffff), 0x01000193);
  };
  for (const c of state.aiHand) mix(toId(c));
  for (const c of state.allPlayedCards) mix(toId(c));
  mix(state.deck.length);
  mix(state.playerHand ? state.playerHand.length : 3);
  mix(state.aiPoints || 0);
  mix(state.playerPoints || 0);
  mix(playerCardId + 1);
  return h >>> 0;
}

// Search effort per phase. Depth is in tricks (a trick = 2 plies + draws).
// From deck<=7 the game is solved to the end inside every world (see the
// exhaustive branch in choosePimcMove); earlier phases use sampled worlds
// with a fixed horizon.
function pimcConfig(deckCount) {
  if (deckCount <= 15) return { samples: 48, depth: 5 };
  return { samples: 44, depth: 5 };
}

// Deck orders examined per enumerated player hand in the exhaustive branch.
function ordersPerHand(deckCount) {
  if (deckCount <= 3) return -1; // all permutations
  return deckCount <= 5 ? 2 : 1;
}

function nChooseK(n, k) {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

// A world gives the player `pHand`. Suits the player has declined to follow
// are unlikely (not impossible: following suit is optional in Brisca), so such
// worlds count for less in the average.
function worldWeight(voidMask, pHand) {
  if (voidMask === 0) return 1;
  let w = 1;
  for (let i = 0; i < pHand.length; i++) {
    if (voidMask & (1 << ID_SUIT[pHand[i]])) w *= 0.45;
  }
  return w;
}

function kSubsets(arr, k) {
  const out = [];
  const cur = [];
  (function rec(start) {
    if (cur.length === k) {
      out.push(cur.slice());
      return;
    }
    for (let i = start; i <= arr.length - (k - cur.length); i++) {
      cur.push(arr[i]);
      rec(i + 1);
      cur.pop();
    }
  })(0);
  return out;
}

function permutations(arr) {
  if (arr.length <= 1) return [arr.slice()];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    for (const rest of permutations(removeAt(arr, i))) {
      out.push([arr[i], ...rest]);
    }
  }
  return out;
}

// Deterministic tie-break among equally-scored moves: spend the weakest
// card - non-trump before trump, fewer points, lower rank.
function moveTieKey(id, trumpS) {
  return (ID_SUIT[id] === trumpS ? 1000 : 0) + ID_PTS[id] * 20 + ID_RANK[id];
}

// ---------- The hard-mode decision ----------

function playHardMode(state, playerCard = null) {
  // Deck empty: card counting pins the player's exact hand; solve perfectly.
  // (Covers both leading and responding - when responding, the led card is on
  // the table and therefore excluded from the deduced holding.)
  if (state.deck.length === 0) {
    const unseen = computeUnseen(state);
    let pool = playerCard ? unseen.filter(c => !cardEq(c, playerCard)) : unseen;
    if (!state.trumpTaken && state.trumpCard) {
      pool = pool.filter(c => !cardEq(c, state.trumpCard));
    }
    if (pool.length <= 3 && state.playerHand && pool.length === state.playerHand.length) {
      const known = playerCard ? [playerCard, ...pool] : pool.slice();
      return solveEndgame(state, playerCard, known);
    }
  }
  return choosePimcMove(state, playerCard);
}

function choosePimcMove(state, playerCard) {
  const aiIds = state.aiHand.map(toId);
  if (aiIds.length === 1) return 0;

  const trumpS = SUIT_IDX.has(state.trumpSuit) ? SUIT_IDX.get(state.trumpSuit) : -1;
  const playerCardId = playerCard ? toId(playerCard) : -1;

  // Everything whose location is known: our hand, the play history, the
  // player's on-table lead, and the face-up trump.
  const seen = new Uint8Array(N_IDS);
  for (const id of aiIds) seen[id] = 1;
  for (const c of state.allPlayedCards) seen[toId(c)] = 1;
  if (playerCardId >= 0) seen[playerCardId] = 1;
  let faceUpTrump = -1;
  if (!state.trumpTaken && state.trumpCard) {
    faceUpTrump = toId(state.trumpCard);
    seen[faceUpTrump] = 1;
  }

  const pool = [];
  for (let id = 0; id < N_IDS; id++) {
    if (!seen[id]) pool.push(id);
  }

  const hiddenCount = Math.min(state.playerHand ? state.playerHand.length : 3, pool.length);
  const deckCount = Math.min(state.deck.length, pool.length - hiddenCount);
  const curDiff = (state.aiPoints || 0) - (state.playerPoints || 0);

  let voidMask = 0;
  if (state.playerVoidSuits) {
    for (const s of state.playerVoidSuits) {
      if (SUIT_IDX.has(s)) voidMask |= 1 << SUIT_IDX.get(s);
    }
  }

  const scores = new Float64Array(aiIds.length);
  const rng = mulberry32(stateSeed(state, playerCardId));

  // Every candidate move is scored against the SAME worlds (common random
  // numbers), so the comparison between moves is low-variance.
  if (deckCount <= 7 && pool.length === hiddenCount + deckCount &&
      nChooseK(pool.length, hiddenCount) <= 140) {
    // Late game (deck <= 7): enumerate EVERY possible player hand and solve
    // each world to the end of the game. Deck order is fully enumerated when
    // the deck is tiny, sampled otherwise.
    const perHand = ordersPerHand(deckCount);
    for (const pHand of kSubsets(pool, hiddenCount)) {
      const inHand = new Set(pHand);
      const rest = pool.filter(id => !inHand.has(id));
      const w = worldWeight(voidMask, pHand);
      let orders;
      if (perHand === -1) {
        orders = permutations(rest);
      } else {
        orders = [];
        for (let k = 0; k < perHand; k++) {
          const o = rest.slice();
          for (let i = o.length - 1; i > 0; i--) {
            const j = (rng() * (i + 1)) | 0;
            const t = o[i];
            o[i] = o[j];
            o[j] = t;
          }
          orders.push(o);
        }
      }
      const wo = w / orders.length; // each hand counts once regardless of orders
      for (const deck of orders) {
        for (let m = 0; m < aiIds.length; m++) {
          scores[m] += wo * rootMoveValue(aiIds, m, pHand, deck, deck.length,
            faceUpTrump, playerCardId, 99, curDiff, trumpS);
        }
      }
    }
  } else {
    const { samples, depth } = pimcConfig(deckCount);
    const buf = pool.slice();
    for (let s = 0; s < samples; s++) {
      for (let i = buf.length - 1; i > 0; i--) {
        const j = (rng() * (i + 1)) | 0;
        const t = buf[i];
        buf[i] = buf[j];
        buf[j] = t;
      }
      const pHand = buf.slice(0, hiddenCount);
      const deck = buf.slice(hiddenCount, hiddenCount + deckCount);
      const w = worldWeight(voidMask, pHand);
      for (let m = 0; m < aiIds.length; m++) {
        scores[m] += w * rootMoveValue(aiIds, m, pHand, deck, deckCount,
          faceUpTrump, playerCardId, depth, curDiff, trumpS);
      }
    }
  }

  let bestIdx = 0;
  for (let m = 1; m < aiIds.length; m++) {
    if (scores[m] > scores[bestIdx] + 1e-9) {
      bestIdx = m;
    } else if (Math.abs(scores[m] - scores[bestIdx]) <= 1e-9 &&
               moveTieKey(aiIds[m], trumpS) < moveTieKey(aiIds[bestIdx], trumpS)) {
      bestIdx = m;
    }
  }
  return bestIdx;
}

// ============================================================
// ENDGAME SOLVER
// Called when the deck is empty and the player's remaining cards are fully
// deduced (playerKnownHand includes the on-table lead when responding).
// Objective: secure the win first, then maximize the point margin.
// Returns the index in state.aiHand of the optimal play.
// ============================================================
function solveEndgame(state, playerCard, playerKnownHand) {
  const trumpS = SUIT_IDX.has(state.trumpSuit) ? SUIT_IDX.get(state.trumpSuit) : -1;
  const aiIds = state.aiHand.map(toId);
  const playerCardId = playerCard ? toId(playerCard) : -1;
  const pIds = playerKnownHand
    .filter(c => !(playerCard && cardEq(c, playerCard)))
    .map(toId);
  const curDiff = (state.aiPoints || 0) - (state.playerPoints || 0);
  const emptyDeck = [];

  let best = -INF;
  let bestIdx = 0;
  for (let m = 0; m < aiIds.length; m++) {
    const v = rootMoveValue(aiIds, m, pIds, emptyDeck, 0, -1, playerCardId, 99, curDiff, trumpS);
    if (v > best) {
      best = v;
      bestIdx = m;
    }
  }
  return bestIdx;
}

export {
  chooseAiCard,
  playHardMode,
  computeUnseen,
  solveEndgame
};
