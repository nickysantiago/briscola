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
  gptPoints
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
  // We've already checked if gptHand is empty in the makeGptPlay function
  // Always play a random card
  return Math.floor(Math.random() * gptHand.length);
}

// Normal Mode - Current AI implementation (strategic but not optimal)
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

// Hard Mode - Advanced AI with card counting and optimal strategy
function playHardMode(playerCard = null) {
  // Track all cards played so far (including current hands)
  const playedCards = [...playerWonCards, ...gptWonCards].filter(card => card !== null && card !== undefined);
  
  // Create a complete deck to track which cards have been played
  const fullDeck = [];
  for (const suit of SUITS) {
    for (const value of [1, 2, 3, 4, 5, 6, 7, 10, 11, 12]) {
      fullDeck.push({ suit, value });
    }
  }
  
  // Track which cards are still in play (not in our hand and not played yet)
  const cardsInPlay = fullDeck.filter(card => {
    // Check if this card is in GPT's hand
    const inGptHand = gptHand.some(c => c.suit === card.suit && c.value === card.value);
    
    // Check if this card has been played already
    const hasBeenPlayed = playedCards.some(c => c && c.suit === card.suit && c.value === card.value);
    
    // Card is in play if it's not in our hand and hasn't been played yet
    return !inGptHand && !hasBeenPlayed;
  });
  
  // These cards are most likely in player's hand or still in the deck
  const possiblePlayerCards = cardsInPlay.filter(card => card.suit !== trumpCard.suit);
  const possiblePlayerTrumps = cardsInPlay.filter(card => card.suit === trumpCard.suit);
  
  // Count cards by suit and value
  const cardCounts = {
    Oros: { played: 0, total: 10, remaining: 10 },
    Copas: { played: 0, total: 10, remaining: 10 },
    Espadas: { played: 0, total: 10, remaining: 10 },
    Bastos: { played: 0, total: 10, remaining: 10 }
  };
  
  // Count played cards by suit
  playedCards.forEach(card => {
    if (card && card.suit) {
      cardCounts[card.suit].played++;
      cardCounts[card.suit].remaining--;
    }
  });
  
  // Subtract our hand from remaining counts
  gptHand.forEach(card => {
    cardCounts[card.suit].remaining--;
  });
  
  // Calculate game phase based on deck size
  const gamePhase = deck.length > 15 ? 'early' : deck.length > 6 ? 'mid' : 'late';
  
  // Calculate score situation
  const scoreDifference = gptPoints - playerPoints;
  const scoreSituation = scoreDifference > 15 ? 'winning_big' : 
                          scoreDifference > 5 ? 'winning' :
                          scoreDifference < -15 ? 'losing_big' :
                          scoreDifference < -5 ? 'losing' : 'close';
  
  // If GPT leads
  if (!playerLeads) {
    // LEADING STRATEGIES
    
    // Calculate the total value of high cards in each suit in our hand
    const suitValueMap = {};
    SUITS.forEach(suit => {
      const cardsInSuit = gptHand.filter(c => c.suit === suit);
      const valueOfSuit = cardsInSuit.reduce((total, card) => {
        return total + (VALUE_POINTS[card.value] || 0);
      }, 0);
      suitValueMap[suit] = {
        count: cardsInSuit.length,
        value: valueOfSuit
      };
    });
    
    // SPECIAL CASES BASED ON GAME PHASE
    
    // EARLY GAME: Prioritize leading with low cards that can't be trumped
    if (gamePhase === 'early') {
      // If we have a non-trump suit where all remaining cards are in our hand
      for (const suit in cardCounts) {
        if (suit !== trumpCard.suit && 
            cardCounts[suit].remaining === suitValueMap[suit].count &&
            suitValueMap[suit].count > 0) {
          // We have all remaining cards of this suit - safe to play high value cards
          const highValueCard = gptHand
            .filter(c => c.suit === suit && VALUE_POINTS[c.value] > 0)
            .sort((a, b) => (VALUE_POINTS[b.value] || 0) - (VALUE_POINTS[a.value] || 0))[0];
          
          if (highValueCard) {
            return gptHand.indexOf(highValueCard);
          }
        }
      }
      
      // Strategy: Lead with a low card from a suit where player is likely out of cards
      const suitPlayerLikelyOut = Object.keys(cardCounts).find(suit => 
        suit !== trumpCard.suit && 
        cardCounts[suit].played > 7 && 
        suitValueMap[suit].count > 0);
      
      if (suitPlayerLikelyOut) {
        // Find our lowest value card in this suit
        const lowestCard = gptHand
          .filter(c => c.suit === suitPlayerLikelyOut)
          .sort((a, b) => (VALUE_POINTS[a.value] || 0) - (VALUE_POINTS[b.value] || 0))[0];
        
        return gptHand.indexOf(lowestCard);
      }
    }
    
    // MID GAME: Strategic lead based on trump count and player tendencies
    if (gamePhase === 'mid') {
      // If we have high value cards and player is low on trumps, play them
      const playerTrumpsLeft = possiblePlayerTrumps.length;
      const highValueCards = gptHand.filter(c => (VALUE_POINTS[c.value] || 0) >= 10);
      
      if (playerTrumpsLeft === 0 && highValueCards.length > 0) {
        // Safe to play high value cards - player has no trumps
        return gptHand.indexOf(highValueCards[0]);
      }
      
      // If we're behind, try to win points by leading with medium value cards
      if (scoreSituation === 'losing' || scoreSituation === 'losing_big') {
        const mediumCards = gptHand.filter(c => (VALUE_POINTS[c.value] || 0) >= 3 && (VALUE_POINTS[c.value] || 0) < 10);
        if (mediumCards.length > 0) {
          return gptHand.indexOf(mediumCards[0]);
        }
      }
    }
    
    // LATE GAME: Aggressive high value play
    if (gamePhase === 'late') {
      // In late game, play high value cards if we have trump superiority
      const ourTrumps = gptHand.filter(c => c.suit === trumpCard.suit);
      const playerPossibleTrumps = possiblePlayerTrumps.length;
      
      if (ourTrumps.length > playerPossibleTrumps) {
        // We have trump advantage - play high value cards
        const highCards = gptHand
          .filter(c => c.suit !== trumpCard.suit && (VALUE_POINTS[c.value] || 0) > 0)
          .sort((a, b) => (VALUE_POINTS[b.value] || 0) - (VALUE_POINTS[a.value] || 0));
        
        if (highCards.length > 0) {
          return gptHand.indexOf(highCards[0]);
        }
      }
      
      // If we're way behind, take risks with high cards
      if (scoreSituation === 'losing_big' && deck.length <= 2) {
        const highestCard = gptHand
          .sort((a, b) => (VALUE_POINTS[b.value] || 0) - (VALUE_POINTS[a.value] || 0))[0];
        
        if (highestCard && (VALUE_POINTS[highestCard.value] || 0) > 0) {
          return gptHand.indexOf(highestCard);
        }
      }
    }
    
    // If no special case matched, use these general strategies
    
    // 1. If we have aces or threes of non-trump suits with few cards left in that suit, lead with them
    const highValueNonTrumps = gptHand.filter(c => 
      c.suit !== trumpCard.suit && 
      (c.value === 1 || c.value === 3) && 
      cardCounts[c.suit].remaining <= 2
    );
    
    if (highValueNonTrumps.length > 0) {
      return gptHand.indexOf(highValueNonTrumps[0]);
    }
    
    // 2. Lead with a card from a suit we have multiple cards in (card dominance strategy)
    let bestSuitToPlay = null;
    let bestSuitScore = -1;
    
    for (const suit in suitValueMap) {
      if (suitValueMap[suit].count < 2) continue;
      
      // Calculate a score based on how many cards we have and their value
      const dominanceScore = suitValueMap[suit].count * 10 - suitValueMap[suit].value;
      
      // Prefer suits where we have more cards but lower value (we want to keep high value cards)
      if (dominanceScore > bestSuitScore) {
        bestSuitScore = dominanceScore;
        bestSuitToPlay = suit;
      }
    }
    
    if (bestSuitToPlay) {
      // Play lowest card from our most dominant suit
      const cardsInSuit = gptHand.filter(c => c.suit === bestSuitToPlay);
      const lowestCard = cardsInSuit.reduce((lowest, current) => {
        const lowestPoints = VALUE_POINTS[lowest.value] || 0;
        const currentPoints = VALUE_POINTS[current.value] || 0;
        return currentPoints < lowestPoints ? current : lowest;
      }, cardsInSuit[0]);
      
      return gptHand.indexOf(lowestCard);
    }
    
    // 3. Last resort: Lead with our lowest value card
    const lowestValueCard = gptHand.reduce((lowest, current) => {
      const lowestPoints = VALUE_POINTS[lowest.value] || 0;
      const currentPoints = VALUE_POINTS[current.value] || 0;
      return currentPoints < lowestPoints ? current : lowest;
    }, gptHand[0]);
    
    return gptHand.indexOf(lowestValueCard);
  }
  // If player leads and GPT responds
  else {
    // FOLLOWING STRATEGIES
    
    const trumpsInHand = gptHand.filter(c => c.suit === trumpCard.suit);
    const sameSuitCards = gptHand.filter(c => c.suit === playerCard.suit);
    const playerCardPoints = VALUE_POINTS[playerCard.value] || 0;
    
    // Track the highest rank of each suit still in play
    const highestRankBySuit = {};
    SUITS.forEach(suit => {
      const highestCard = cardsInPlay
        .filter(c => c.suit === suit)
        .sort((a, b) => getCardRank(b) - getCardRank(a))[0];
      
      highestRankBySuit[suit] = highestCard ? getCardRank(highestCard) : -1;
    });
    
    // ADVANCED DECISION: Calculate the "worth" of winning this trick
    // Consider: card points, game phase, score difference, and trump scarcity
    
    // Base worth on the points in the trick
    let trickWorth = playerCardPoints;
    
    // Adjust based on game phase (more valuable in late game)
    if (gamePhase === 'late') trickWorth *= 1.5;
    
    // Adjust based on score situation
    if (scoreSituation === 'losing' || scoreSituation === 'losing_big') {
      trickWorth *= 1.3; // More valuable if we're behind
    }
    
    // Adjust based on trump scarcity (conserve trumps if few remain)
    const trumpsRemaining = cardCounts[trumpCard.suit].remaining + trumpsInHand.length;
    if (trumpsRemaining <= 3 && playerCard.suit !== trumpCard.suit) {
      trickWorth *= 0.7; // Less valuable if we need to use scarce trumps
    }
    
    // Calculate final "worth winning" threshold
    // Higher threshold means we're more selective about which tricks to win
    const worthWinningThreshold = gamePhase === 'early' ? 3 : 
                                  gamePhase === 'mid' ? 2 : 1;
    
    const worthWinning = trickWorth >= worthWinningThreshold || 
                         (deck.length <= 4 && gptPoints < playerPoints);
    
    // If we decide it's worth winning this trick
    if (worthWinning) {
      // Case 1: Player played trump
      if (playerCard.suit === trumpCard.suit) {
        // If we have higher trumps, use the lowest one that will win
        const winningTrumps = sameSuitCards.filter(c => getCardRank(c) > getCardRank(playerCard));
        
        if (winningTrumps.length > 0) {
          // Find the most efficient winning trump (lowest that still wins)
          const lowestWinningTrump = winningTrumps.reduce((lowest, current) => 
            getCardRank(current) < getCardRank(lowest) ? current : lowest, winningTrumps[0]);
          
          // Special case: If this is a high value trick, use a higher trump for safety
          if (playerCardPoints >= 10 && winningTrumps.length > 1) {
            // Use second lowest trump to win important tricks with safety margin
            const sortedWinningTrumps = winningTrumps.sort((a, b) => getCardRank(a) - getCardRank(b));
            return gptHand.indexOf(sortedWinningTrumps[1] || sortedWinningTrumps[0]);
          }
          
          return gptHand.indexOf(lowestWinningTrump);
        }
        
        // If we can't win with trump, strategic discard based on game phase
        if (gamePhase === 'early' || gamePhase === 'mid') {
          // Discard our lowest value card
          const lowestValueCard = gptHand.reduce((lowest, current) => {
            const lowestPoints = VALUE_POINTS[lowest.value] || 0;
            const currentPoints = VALUE_POINTS[current.value] || 0;
            return currentPoints < lowestPoints ? current : lowest;
          }, gptHand[0]);
          
          return gptHand.indexOf(lowestValueCard);
        } else {
          // In late game, consider discarding from suits where player might be void
          // This reduces the chance of player trumping our high cards later
          
          // Find a suit where player might be void (high played count)
          const suitToDiscard = Object.keys(cardCounts).find(suit => 
            suit !== trumpCard.suit && 
            cardCounts[suit].played >= 8 &&
            gptHand.some(c => c.suit === suit));
          
          if (suitToDiscard) {
            const cardToDiscard = gptHand
              .filter(c => c.suit === suitToDiscard)
              .sort((a, b) => (VALUE_POINTS[a.value] || 0) - (VALUE_POINTS[b.value] || 0))[0];
            
            return gptHand.indexOf(cardToDiscard);
          }
          
          // Default to lowest value card
          const lowestValueCard = gptHand.reduce((lowest, current) => {
            const lowestPoints = VALUE_POINTS[lowest.value] || 0;
            const currentPoints = VALUE_POINTS[current.value] || 0;
            return currentPoints < lowestPoints ? current : lowest;
          }, gptHand[0]);
          
          return gptHand.indexOf(lowestValueCard);
        }
      }
      
      // Case 2: Player didn't play trump, but it's a valuable card or trick
      
      // First try to win with the same suit if possible
      if (sameSuitCards.length > 0) {
        const winningCards = sameSuitCards.filter(c => getCardRank(c) > getCardRank(playerCard));
        
        if (winningCards.length > 0) {
          // Find the most efficient winning card (lowest that still wins)
          const lowestWinner = winningCards.reduce((lowest, current) => 
            getCardRank(current) < getCardRank(lowest) ? current : lowest, winningCards[0]);
          
          // Special case: If it's a very high value trick, use a higher card for safety
          if (playerCardPoints >= 10 && winningCards.length > 1) {
            // Use second lowest card to win important tricks
            const sortedWinningCards = winningCards.sort((a, b) => getCardRank(a) - getCardRank(b));
            return gptHand.indexOf(sortedWinningCards[1] || sortedWinningCards[0]);
          }
          
          return gptHand.indexOf(lowestWinner);
        }
      }
      
      // If we can't win with same suit, consider using trump
      if (trumpsInHand.length > 0) {
        // In early game, be more conservative with trumps
        if (gamePhase === 'early' && playerCardPoints < 10) {
          // Only use trump for high value cards in early game
          if (playerCardPoints < 3) {
            // Not worth trumping low value cards in early game
            const lowestCard = gptHand
              .filter(c => c.suit !== trumpCard.suit)
              .sort((a, b) => (VALUE_POINTS[a.value] || 0) - (VALUE_POINTS[b.value] || 0))[0] || gptHand[0];
            
            return gptHand.indexOf(lowestCard);
          }
        }
        
        // Use lowest trump to win the trick
        const lowestTrump = trumpsInHand.reduce((lowest, current) => 
          getCardRank(current) < getCardRank(lowest) ? current : lowest, trumpsInHand[0]);
        
        return gptHand.indexOf(lowestTrump);
      }
    }
    
    // If not worth winning or we can't win
    
    // First, try to follow suit with our lowest card
    if (sameSuitCards.length > 0) {
      // Special case: If our card would win anyway, consider the value
      const winningCards = sameSuitCards.filter(c => getCardRank(c) > getCardRank(playerCard));
      
      if (winningCards.length > 0) {
        // We can win - decide if we want to
        if (playerCardPoints > 0 || gamePhase === 'late') {
          // Win the trick if there are points or it's late game
          const lowestWinner = winningCards.reduce((lowest, current) => 
            getCardRank(current) < getCardRank(lowest) ? current : lowest, winningCards[0]);
          
          return gptHand.indexOf(lowestWinner);
        }
      }
      
      // Otherwise play our lowest card in the suit
      const lowestCard = sameSuitCards.reduce((lowest, current) => {
        const lowestPoints = VALUE_POINTS[lowest.value] || 0;
        const currentPoints = VALUE_POINTS[current.value] || 0;
        // If points are equal, prefer lower rank
        if (currentPoints === lowestPoints) {
          return getCardRank(current) < getCardRank(lowest) ? current : lowest;
        }
        return currentPoints < lowestPoints ? current : lowest;
      }, sameSuitCards[0]);
      
      return gptHand.indexOf(lowestCard);
    }
    
    // If we can't follow suit, play strategically
    
    // Check if player is likely to have the highest card of any suit
    // If so, discard high value cards from that suit
    const vulnerableSuits = [];
    for (const suit in highestRankBySuit) {
      if (suit === trumpCard.suit) continue; // Skip trump suit
      
      // Check if player might have highest card in this suit
      const ourHighestInSuit = gptHand
        .filter(c => c.suit === suit)
        .sort((a, b) => getCardRank(b) - getCardRank(a))[0];
      
      const ourHighestRank = ourHighestInSuit ? getCardRank(ourHighestInSuit) : -1;
      
      // If there's a higher card out there that we don't have, this suit is vulnerable
      if (highestRankBySuit[suit] > ourHighestRank) {
        vulnerableSuits.push(suit);
      }
    }
    
    // If we found vulnerable suits, discard high value cards from them
    if (vulnerableSuits.length > 0) {
      const vulnerableHighValueCards = gptHand.filter(c => 
        vulnerableSuits.includes(c.suit) && 
        (VALUE_POINTS[c.value] || 0) > 0
      ).sort((a, b) => (VALUE_POINTS[b.value] || 0) - (VALUE_POINTS[a.value] || 0));
      
      if (vulnerableHighValueCards.length > 0) {
        return gptHand.indexOf(vulnerableHighValueCards[0]);
      }
    }
    
    // Otherwise discard our least valuable card overall (avoiding high trumps)
    const discardableCards = gptHand.filter(c => {
      // Never discard Ace or Three of trumps if possible
      if (c.suit === trumpCard.suit && (c.value === 1 || c.value === 3)) {
        return gptHand.length <= 1; // Only discard if it's our last card
      }
      return true;
    });
    
    if (discardableCards.length > 0) {
      const lowestValueCard = discardableCards.reduce((lowest, current) => {
        const lowestPoints = VALUE_POINTS[lowest.value] || 0;
        const currentPoints = VALUE_POINTS[current.value] || 0;
        return currentPoints < lowestPoints ? current : lowest;
      }, discardableCards[0]);
      
      return gptHand.indexOf(lowestValueCard);
    }
    
    // Last resort - just play whatever we have left
    return 0;
  }
}

export { makeGptPlay };
