// ai-player.js - AI/GPT player logic with multiple difficulty levels

import { 
  VALUE_POINTS,
  RANK_MAP,
  SUITS
} from './constants.js';
import { 
  playerLeads, 
  trumpCard, 
  gptHand,
  playerHand,
  deck,
  removeCardFromGptHand,
  difficulty,
  playerWonCards,
  gptWonCards,
  playerPoints,
  gptPoints,
  allPlayedCards,
  playerVoidSuits
} from './game-state.js';
import { 
  getCardRank 
} from './game-logic.js';
import { 
  createGptPlayField,
  addGptCardToPlayField,
} from './ui-renderer.js';

function makeGptPlay(playerCard = null) {
  // First check if GPT has cards to play
  if (gptHand.length === 0) {
    console.error("GPT has no cards to play!");
    return null;
  }
  
  // Select AI strategy based on difficulty
  let gptCardIndex;
  
  switch(difficulty) {
    case 'easy':
      gptCardIndex = playEasyMode(playerCard);
      break;
    case 'normal':
      gptCardIndex = playNormalMode(playerCard);
      break;
    case 'hard':
      gptCardIndex = playHardMode(playerCard);
      break;
    default:
      console.warn(`Unknown difficulty '${difficulty}', defaulting to normal`);
      gptCardIndex = playNormalMode(playerCard);
  }
  
  const gptCard = removeCardFromGptHand(gptCardIndex);
  
  // Animate GPT's card play when it leads
  if (!playerLeads) {
    // Create a "floating" card that moves from GPT hand area to play area
    const cardElement = document.createElement('div');
    cardElement.className = `card ${gptCard.suit === trumpCard.suit ? 'trump' : ''}`;
    cardElement.style.backgroundImage = `url('cards/${gptCard.value}_of_${gptCard.suit.toLowerCase()}.png')`;
    cardElement.style.position = 'fixed';
    
    // Start from GPT hand area (top of screen)
    cardElement.style.top = '50px';
    cardElement.style.left = '50%';
    cardElement.style.transform = 'translateX(-50%)';
    cardElement.style.zIndex = '100';
    cardElement.innerHTML = `${gptCard.value} of ${gptCard.suit}`;
    document.body.appendChild(cardElement);
    
    // Get play area position
    const playArea = document.getElementById('play-area');
    const playAreaRect = playArea.getBoundingClientRect();
    
    // Calculate destination (center of play area)
    setTimeout(() => {
      cardElement.style.top = `${playAreaRect.top + 50}px`;
      
      // Wait for animation to complete
      setTimeout(() => {
        // Remove the floating card
        document.body.removeChild(cardElement);
        // Show in the play field
        createGptPlayField(gptCard);
      }, 500);
    }, 10);
    
    return gptCard; // Return card but don't finish trick yet - player needs to respond
  }
  
  // If responding to player, add GPT's card to play field with animation
  // Create a "floating" card that moves to play area
  const cardElement = document.createElement('div');
  cardElement.className = `card ${gptCard.suit === trumpCard.suit ? 'trump' : ''}`;
  cardElement.style.backgroundImage = `url('cards/${gptCard.value}_of_${gptCard.suit.toLowerCase()}.png')`;
  cardElement.style.position = 'fixed';
  
  // Start from GPT hand area (top of screen)
  cardElement.style.top = '50px';
  cardElement.style.right = '25%';
  cardElement.style.zIndex = '100';
  cardElement.innerHTML = `${gptCard.value} of ${gptCard.suit}`;
  document.body.appendChild(cardElement);
  
  // Get play area position
  const playArea = document.getElementById('play-area');
  const playField = playArea.querySelector('.play-field');
  const playAreaRect = playField.getBoundingClientRect();
  
  // Calculate destination (right side of play field)
  setTimeout(() => {
    cardElement.style.top = `${playAreaRect.top + 50}px`;
    cardElement.style.right = `${window.innerWidth - playAreaRect.right + 20}px`;
    
    // Wait for animation to complete
    setTimeout(() => {
      // Remove the floating card
      document.body.removeChild(cardElement);
      // Add to the play field
      addGptCardToPlayField(gptCard);
    }, 500);
  }, 10);
  
  return gptCard;
}

// Easy Mode - Simply play random cards regardless of strategy
function playEasyMode(playerCard = null) {
  return Math.floor(Math.random() * gptHand.length);
}

// Normal Mode - Strategic but not optimal
function playNormalMode(playerCard = null) {
  let gptCardIndex;
  
  if (!playerLeads) {
    // GPT leads - plays a random card
    gptCardIndex = Math.floor(Math.random() * gptHand.length);
    
  } else {
    // GPT responds to player's lead
    // Try to win with lowest winning card, or play lowest card if can't win
    const trumpsInHand = gptHand.filter(c => c.suit === trumpCard.suit);
    const sameSuitCards = gptHand.filter(c => c.suit === playerCard.suit);
    
    if (playerCard.suit === trumpCard.suit && sameSuitCards.length > 0) {
      // Player played trump, try to win with higher trump or lose with lowest
      const winningTrumps = sameSuitCards.filter(c => 
        getCardRank(c) > getCardRank(playerCard));
      
      if (winningTrumps.length > 0) {
        // Play lowest winning trump
        const lowestWinner = winningTrumps.reduce((lowest, current) => 
          getCardRank(current) < getCardRank(lowest) ? current : lowest, winningTrumps[0]);
        gptCardIndex = gptHand.indexOf(lowestWinner);
      } else {
        // Can't win, play lowest card
        const lowestCard = sameSuitCards.reduce((lowest, current) => 
          getCardRank(current) < getCardRank(lowest) ? current : lowest, sameSuitCards[0]);
        gptCardIndex = gptHand.indexOf(lowestCard);
      }
    } else if (playerCard.suit !== trumpCard.suit && trumpsInHand.length > 0) {
      // Player didn't play trump, GPT can win with any trump
      const lowestTrump = trumpsInHand.reduce((lowest, current) => 
        getCardRank(current) < getCardRank(lowest) ? current : lowest, trumpsInHand[0]);
      gptCardIndex = gptHand.indexOf(lowestTrump);
    } else if (sameSuitCards.length > 0) {
      // Try to win with same suit
      const winningCards = sameSuitCards.filter(c => 
        getCardRank(c) > getCardRank(playerCard));
      
      if (winningCards.length > 0) {
        // Play lowest winning card
        const lowestWinner = winningCards.reduce((lowest, current) => 
          getCardRank(current) < getCardRank(lowest) ? current : lowest, winningCards[0]);
        gptCardIndex = gptHand.indexOf(lowestWinner);
      } else {
        // Can't win, play lowest card
        const lowestCard = sameSuitCards.reduce((lowest, current) => 
          getCardRank(current) < getCardRank(lowest) ? current : lowest, sameSuitCards[0]);
        gptCardIndex = gptHand.indexOf(lowestCard);
      }
    } else {
      // Can't win, throw lowest value card
      const lowestValueCard = gptHand.reduce((lowest, current) => {
        const currentPoints = VALUE_POINTS[current.value] || 0;
        const lowestPoints = VALUE_POINTS[lowest.value] || 0;
        return currentPoints < lowestPoints ? current : lowest;
      }, gptHand[0]);
      gptCardIndex = gptHand.indexOf(lowestValueCard);
    }
  }
  
  return gptCardIndex;
}

// ============================================================
// HARD MODE - Expert AI with card counting, void tracking,
// and perfect-information endgame solver.
// ============================================================

function cardEq(a, b) {
  return !!a && !!b && a.suit === b.suit && a.value === b.value;
}

// Build the set of cards GPT has not seen (not in its hand, not played).
// These are the cards in the player's hand + remaining deck + trump card
// (until trump card is picked up as the final draw).
function computeUnseen() {
  const full = [];
  for (const suit of SUITS) {
    for (const value of [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]) {
      full.push({ suit, value });
    }
  }
  return full.filter(c =>
    !gptHand.some(h => cardEq(h, c)) &&
    !allPlayedCards.some(p => cardEq(p, c))
  );
}

function playHardMode(playerCard = null) {
  const unseen = computeUnseen();
  const trumpsInHand = gptHand.filter(c => c.suit === trumpCard.suit);
  const gamePhase = deck.length > 15 ? 'early' : deck.length > 6 ? 'mid' : 'late';
  const scoreDiff = gptPoints - playerPoints;

  // ------------------------------------------------------------
  // PERFECT ENDGAME: deck empty + <=3 cards each.
  // Unseen cards == player's hand exactly. Brute-force minimax.
  // ------------------------------------------------------------
  if (deck.length === 0) {
    // Player's hand is exactly the unseen set (trump already drawn).
    const playerKnownHand = unseen.slice();
    if (playerKnownHand.length <= 3 && playerKnownHand.length === playerHand.length) {
      return solveEndgame(playerCard, playerKnownHand);
    }
  }

  // ------------------------------------------------------------
  // HEURISTIC PLAY (deck non-empty or hand too large for search)
  // ------------------------------------------------------------

  // ================== LEADING ==================
  if (!playerLeads) {
    // 1. Cash a guaranteed winner: highest remaining card of a non-trump suit,
    //    in a suit where the player is NOT known void. Only worth it if the
    //    card itself carries points (otherwise it's a wasted lead).
    for (const c of gptHand) {
      if (c.suit === trumpCard.suit) continue;
      if (playerVoidSuits.has(c.suit)) continue; // they'll trump or dump
      const higherUnseen = unseen.some(u =>
        u.suit === c.suit && getCardRank(u) > getCardRank(c)
      );
      if (!higherUnseen && (VALUE_POINTS[c.value] || 0) >= 3) {
        return gptHand.indexOf(c);
      }
    }

    // 2. If player is out of trumps entirely, cash our highest point non-trump.
    const playerTrumpsRemaining = unseen.filter(u => u.suit === trumpCard.suit).length;
    if (playerTrumpsRemaining === 0) {
      const best = gptHand
        .filter(c => c.suit !== trumpCard.suit)
        .sort((a, b) => (VALUE_POINTS[b.value] || 0) - (VALUE_POINTS[a.value] || 0))[0];
      if (best && (VALUE_POINTS[best.value] || 0) > 0) return gptHand.indexOf(best);
    }

    // 3. If we have trump Ace or 3 and there are still point-bearing non-trumps
    //    out there, consider leading a medium-value non-trump to bait the player
    //    into committing trumps. Skip if we're already winning big.
    if (gamePhase === 'mid' && scoreDiff < 15 && trumpsInHand.some(t => t.value === 1 || t.value === 3)) {
      const bait = gptHand
        .filter(c => c.suit !== trumpCard.suit && !playerVoidSuits.has(c.suit))
        .filter(c => {
          const pts = VALUE_POINTS[c.value] || 0;
          return pts >= 2 && pts <= 4; // Jacks/Kings
        })
        .sort((a, b) => (VALUE_POINTS[a.value] || 0) - (VALUE_POINTS[b.value] || 0))[0];
      if (bait) return gptHand.indexOf(bait);
    }

    // 4. Lead a low zero-point card. Prefer suits the player is void in
    //    (they must discard or trump — either costs them).
    const zeroPointLeads = gptHand
      .filter(c => c.suit !== trumpCard.suit && (VALUE_POINTS[c.value] || 0) === 0)
      .sort((a, b) => {
        const aVoid = playerVoidSuits.has(a.suit) ? 1 : 0;
        const bVoid = playerVoidSuits.has(b.suit) ? 1 : 0;
        if (aVoid !== bVoid) return bVoid - aVoid;
        return getCardRank(a) - getCardRank(b);
      });
    if (zeroPointLeads.length > 0) return gptHand.indexOf(zeroPointLeads[0]);

    // 5. Fallback: lowest-value, lowest-rank card we own (avoid leading trump
    //    unless forced).
    const nonTrump = gptHand.filter(c => c.suit !== trumpCard.suit);
    const pool = nonTrump.length > 0 ? nonTrump : gptHand;
    const fallback = [...pool].sort((a, b) => {
      const d = (VALUE_POINTS[a.value] || 0) - (VALUE_POINTS[b.value] || 0);
      return d !== 0 ? d : getCardRank(a) - getCardRank(b);
    })[0];
    return gptHand.indexOf(fallback);
  }

  // ================== FOLLOWING ==================
  const sameSuit = gptHand.filter(c => c.suit === playerCard.suit);
  const playerPts = VALUE_POINTS[playerCard.value] || 0;

  // Helper: lowest card that beats `beat` from a set, or null.
  const lowestWinner = (cards, beat) => {
    const winners = cards.filter(c => getCardRank(c) > getCardRank(beat));
    if (!winners.length) return null;
    return winners.reduce((lo, c) => getCardRank(c) < getCardRank(lo) ? c : lo);
  };

  // Case A: Player led trump. Only same-suit (trump) can beat it.
  if (playerCard.suit === trumpCard.suit) {
    const w = lowestWinner(sameSuit, playerCard);
    // Overtake only if it's worth it: player's card has points, OR
    // our winning trump is cheap (rank <= 3, i.e. 4/5/6/7), OR we're losing.
    if (w) {
      const wRank = getCardRank(w);
      if (playerPts > 0 || wRank <= 3 || scoreDiff < -5) {
        return gptHand.indexOf(w);
      }
    }
    // Otherwise dump cheapest non-trump (save trumps for offense).
    return indexOfCheapestDiscard();
  }

  // Case B: Player led a non-trump suit.
  // B1: Follow suit and beat if trick carries points OR our winner is very cheap.
  {
    const w = lowestWinner(sameSuit, playerCard);
    if (w) {
      const wRank = getCardRank(w);
      if (playerPts > 0 || wRank <= 2 || scoreDiff < -5) {
        return gptHand.indexOf(w);
      }
    }
  }

  // B2: Can't/shouldn't win with same suit. Consider trumping.
  if (trumpsInHand.length > 0) {
    // Policy for spending a trump on a non-trump lead:
    //  - Always trump 10+ point cards (Ace 11, Three 10).
    //  - Trump 2–4 point cards in mid/late game, or anytime we're losing.
    //  - Trump 0-point cards only in late game with trump surplus AND
    //    a cheap trump (4/5/6/7).
    const lowestTrump = trumpsInHand.reduce(
      (lo, c) => getCardRank(c) < getCardRank(lo) ? c : lo
    );
    const lowTrumpRank = getCardRank(lowestTrump);

    const shouldTrump =
      playerPts >= 10 ||
      (playerPts >= 2 && (gamePhase !== 'early' || scoreDiff < -5)) ||
      (playerPts === 0 && gamePhase === 'late' && trumpsInHand.length >= 2 && lowTrumpRank <= 3);

    if (shouldTrump) {
      return gptHand.indexOf(lowestTrump);
    }
  }

  // B3: Not winning. If we have same-suit cards, we must play one — dump
  // cheapest in that suit. Otherwise dump cheapest non-trump overall.
  if (sameSuit.length > 0) {
    const cheapest = sameSuit.reduce((lo, c) => {
      const lp = VALUE_POINTS[lo.value] || 0;
      const cp = VALUE_POINTS[c.value] || 0;
      if (cp !== lp) return cp < lp ? c : lo;
      return getCardRank(c) < getCardRank(lo) ? c : lo;
    });
    return gptHand.indexOf(cheapest);
  }

  return indexOfCheapestDiscard();
}

// Dump cheapest card, preferring suits the player is void in (those cards
// will never win anyway) and avoiding trump Ace/Three unless that's all we have.
function indexOfCheapestDiscard() {
  const candidates = gptHand.filter(c =>
    !(c.suit === trumpCard.suit && (c.value === 1 || c.value === 3))
  );
  const pool = candidates.length > 0 ? candidates : gptHand;
  const sorted = [...pool].sort((a, b) => {
    const va = VALUE_POINTS[a.value] || 0;
    const vb = VALUE_POINTS[b.value] || 0;
    if (va !== vb) return va - vb;
    const aVoid = playerVoidSuits.has(a.suit) ? 1 : 0;
    const bVoid = playerVoidSuits.has(b.suit) ? 1 : 0;
    if (aVoid !== bVoid) return bVoid - aVoid;
    // Prefer to dump non-trump
    const aTrump = a.suit === trumpCard.suit ? 1 : 0;
    const bTrump = b.suit === trumpCard.suit ? 1 : 0;
    if (aTrump !== bTrump) return aTrump - bTrump;
    return getCardRank(a) - getCardRank(b);
  });
  return gptHand.indexOf(sorted[0]);
}

// ============================================================
// ENDGAME MINIMAX
// Called only when deck is empty and playerKnownHand.length <= 3.
// With 3 cards each, the search tree has at most ~36 leaves — instant.
// Returns the index in gptHand of the optimal play.
// Objective: maximize (final GPT points - final player points).
// ============================================================
function solveEndgame(playerCard, playerKnownHand) {
  // Resolve a completed trick given leader. Returns 'player' or 'gpt'.
  function resolveTrick(pCard, gCard, leader) {
    const leadSuit = leader === 'player' ? pCard.suit : gCard.suit;
    const pTrump = pCard.suit === trumpCard.suit;
    const gTrump = gCard.suit === trumpCard.suit;
    if (pTrump && gTrump) {
      return getCardRank(pCard) > getCardRank(gCard) ? 'player' : 'gpt';
    }
    if (pTrump) return 'player';
    if (gTrump) return 'gpt';
    if (leader === 'player') {
      if (gCard.suit === leadSuit) {
        return getCardRank(pCard) > getCardRank(gCard) ? 'player' : 'gpt';
      }
      return 'player';
    } else {
      if (pCard.suit === leadSuit) {
        return getCardRank(pCard) > getCardRank(gCard) ? 'player' : 'gpt';
      }
      return 'gpt';
    }
  }

  // Recursive search. `pending` is null if no card is on the table yet,
  // otherwise {card, leader}. Returns net GPT score delta from this subtree.
  function search(gHand, pHand, leads, pending) {
    if (!pending && gHand.length === 0 && pHand.length === 0) return 0;

    if (!pending) {
      // A new trick begins; `leads` plays first.
      if (leads === 'gpt') {
        let best = -Infinity;
        for (const c of gHand) {
          const v = search(
            gHand.filter(x => x !== c),
            pHand,
            'player',
            { card: c, leader: 'gpt' }
          );
          if (v > best) best = v;
        }
        return best;
      } else {
        let worst = Infinity;
        for (const c of pHand) {
          const v = search(
            gHand,
            pHand.filter(x => x !== c),
            'gpt',
            { card: c, leader: 'player' }
          );
          if (v < worst) worst = v;
        }
        return worst;
      }
    }

    // A card is on the table; other side responds and trick resolves.
    const responder = pending.leader === 'gpt' ? 'player' : 'gpt';
    if (responder === 'gpt') {
      let best = -Infinity;
      for (const c of gHand) {
        const winner = resolveTrick(pending.card, c, pending.leader);
        const pts = (VALUE_POINTS[pending.card.value] || 0) + (VALUE_POINTS[c.value] || 0);
        const delta = winner === 'gpt' ? pts : -pts;
        const v = delta + search(
          gHand.filter(x => x !== c),
          pHand,
          winner,
          null
        );
        if (v > best) best = v;
      }
      return best;
    } else {
      let worst = Infinity;
      for (const c of pHand) {
        const winner = resolveTrick(c, pending.card, pending.leader);
        const pts = (VALUE_POINTS[pending.card.value] || 0) + (VALUE_POINTS[c.value] || 0);
        const delta = winner === 'gpt' ? pts : -pts;
        const v = delta + search(
          gHand,
          pHand.filter(x => x !== c),
          winner,
          null
        );
        if (v < worst) worst = v;
      }
      return worst;
    }
  }

  if (playerCard) {
    // GPT is responding to player's lead.
    const pHandRemaining = playerKnownHand.filter(x => !cardEq(x, playerCard));
    let best = -Infinity;
    let bestIdx = 0;
    for (let i = 0; i < gptHand.length; i++) {
      const c = gptHand[i];
      const winner = resolveTrick(playerCard, c, 'player');
      const pts = (VALUE_POINTS[playerCard.value] || 0) + (VALUE_POINTS[c.value] || 0);
      const delta = winner === 'gpt' ? pts : -pts;
      const v = delta + search(
        gptHand.filter((_, j) => j !== i),
        pHandRemaining,
        winner,
        null
      );
      if (v > best) { best = v; bestIdx = i; }
    }
    return bestIdx;
  } else {
    // GPT is leading.
    let best = -Infinity;
    let bestIdx = 0;
    for (let i = 0; i < gptHand.length; i++) {
      const c = gptHand[i];
      const v = search(
        gptHand.filter((_, j) => j !== i),
        playerKnownHand,
        'player',
        { card: c, leader: 'gpt' }
      );
      if (v > best) { best = v; bestIdx = i; }
    }
    return bestIdx;
  }
}

export { makeGptPlay };
