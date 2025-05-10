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
  // Track all cards played so far
  const playedCards = [...playerWonCards, ...gptWonCards].filter(card => card !== null && card !== undefined);
  
  // Count cards by suit and value
  const cardCounts = {
    Oros: { played: 0, total: 10 },
    Copas: { played: 0, total: 10 },
    Espadas: { played: 0, total: 10 },
    Bastos: { played: 0, total: 10 }
  };
  
  // Count played cards by suit
  playedCards.forEach(card => {
    if (card && card.suit) {
      cardCounts[card.suit].played++;
    }
  });
  
  // Calculate probability of player having certain suits
  const remainingCards = {};
  SUITS.forEach(suit => {
    remainingCards[suit] = cardCounts[suit].total - cardCounts[suit].played;
  });
  
  // If GPT leads
  if (!playerLeads) {
    // Consider several strategic plays
    
    // 1. If we have high-value cards that aren't trumps, lead with them early
    const highValueNonTrumps = gptHand.filter(c => 
      c.suit !== trumpCard.suit && 
      (c.value === 1 || c.value === 3) && 
      remainingCards[c.suit] <= 2 // Few cards left in this suit, safer to play
    );
    
    if (highValueNonTrumps.length > 0) {
      return gptHand.indexOf(highValueNonTrumps[0]);
    }
    
    // 2. Lead with a card from a suit we have multiple cards in
    const suitCounts = {};
    gptHand.forEach(card => {
      suitCounts[card.suit] = (suitCounts[card.suit] || 0) + 1;
    });
    
    // Find suit with most cards in hand
    let mostCommonSuit = null;
    let maxCount = 0;
    for (const suit in suitCounts) {
      if (suitCounts[suit] > maxCount) {
        maxCount = suitCounts[suit];
        mostCommonSuit = suit;
      }
    }
    
    if (mostCommonSuit && maxCount >= 2) {
      // Play lowest card from our most common suit
      const cardsInSuit = gptHand.filter(c => c.suit === mostCommonSuit);
      const lowestCard = cardsInSuit.reduce((lowest, current) => {
        const lowestPoints = VALUE_POINTS[lowest.value] || 0;
        const currentPoints = VALUE_POINTS[current.value] || 0;
        return currentPoints < lowestPoints ? current : lowest;
      }, cardsInSuit[0]);
      
      return gptHand.indexOf(lowestCard);
    }
    
    // 3. Lead with our lowest value card
    const lowestValueCard = gptHand.reduce((lowest, current) => {
      const lowestPoints = VALUE_POINTS[lowest.value] || 0;
      const currentPoints = VALUE_POINTS[current.value] || 0;
      return currentPoints < lowestPoints ? current : lowest;
    }, gptHand[0]);
    
    return gptHand.indexOf(lowestValueCard);
  } 
  // If player leads and GPT responds
  else {
    const trumpsInHand = gptHand.filter(c => c.suit === trumpCard.suit);
    const sameSuitCards = gptHand.filter(c => c.suit === playerCard.suit);
    const playerCardPoints = VALUE_POINTS[playerCard.value] || 0;
    
    // Calculate if it's worth winning this trick based on points
    const worthWinning = playerCardPoints >= 3 || (deck.length <= 4 && gptPoints < playerPoints);
    
    // If player played a high value card or we're behind late in the game
    if (worthWinning) {
      // Case 1: Player played trump
      if (playerCard.suit === trumpCard.suit) {
        // If we have higher trumps, use the lowest one that will win
        const winningTrumps = sameSuitCards.filter(c => getCardRank(c) > getCardRank(playerCard));
        
        if (winningTrumps.length > 0) {
          const lowestWinningTrump = winningTrumps.reduce((lowest, current) => 
            getCardRank(current) < getCardRank(lowest) ? current : lowest, winningTrumps[0]);
          return gptHand.indexOf(lowestWinningTrump);
        }
        
        // If we can't win with trump, throw our lowest value card
        const lowestValueCard = gptHand.reduce((lowest, current) => {
          const lowestPoints = VALUE_POINTS[lowest.value] || 0;
          const currentPoints = VALUE_POINTS[current.value] || 0;
          return currentPoints < lowestPoints ? current : lowest;
        }, gptHand[0]);
        
        return gptHand.indexOf(lowestValueCard);
      }
      
      // Case 2: Player didn't play trump, but it's a valuable card
      
      // First try to win with the same suit if possible
      if (sameSuitCards.length > 0) {
        const winningCards = sameSuitCards.filter(c => getCardRank(c) > getCardRank(playerCard));
        
        if (winningCards.length > 0) {
          // Play lowest winning card of the same suit
          const lowestWinner = winningCards.reduce((lowest, current) => 
            getCardRank(current) < getCardRank(lowest) ? current : lowest, winningCards[0]);
          return gptHand.indexOf(lowestWinner);
        }
      }
      
      // If we can't win with same suit, use trump
      if (trumpsInHand.length > 0) {
        // Use lowest trump to win
        const lowestTrump = trumpsInHand.reduce((lowest, current) => 
          getCardRank(current) < getCardRank(lowest) ? current : lowest, trumpsInHand[0]);
        return gptHand.indexOf(lowestTrump);
      }
    }
    
    // If not worth winning or we can't win
    // First, try to follow suit with lowest card
    if (sameSuitCards.length > 0) {
      const lowestCard = sameSuitCards.reduce((lowest, current) => {
        // If the card is winning anyway, use it
        if (getCardRank(current) > getCardRank(playerCard)) {
          return current;
        }
        // Otherwise find the lowest value card
        const lowestPoints = VALUE_POINTS[lowest.value] || 0;
        const currentPoints = VALUE_POINTS[current.value] || 0;
        return currentPoints < lowestPoints ? current : lowest;
      }, sameSuitCards[0]);
      
      return gptHand.indexOf(lowestCard);
    }
    
    // If we can't follow suit, discard our least valuable card
    const lowestValueCard = gptHand.reduce((lowest, current) => {
      // Avoid discarding high value trumps
      if (current.suit === trumpCard.suit && (current.value === 1 || current.value === 3)) {
        return lowest;
      }
      
      const lowestPoints = VALUE_POINTS[lowest.value] || 0;
      const currentPoints = VALUE_POINTS[current.value] || 0;
      return currentPoints < lowestPoints ? current : lowest;
    }, gptHand[0]);
    
    return gptHand.indexOf(lowestValueCard);
  }
}

export { makeGptPlay };
