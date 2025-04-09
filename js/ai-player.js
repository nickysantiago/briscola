// ai-player.js - AI/GPT player logic

import { 
  VALUE_POINTS 
} from './constants.js';
import { 
  playerLeads, 
  trumpCard, 
  gptHand,
  removeCardFromGptHand
} from './game-state.js';
import { 
  getCardRank 
} from './game-logic.js';
import { 
  createGptPlayField,
  addGptCardToPlayField 
} from './ui-renderer.js';

function makeGptPlay(playerCard = null) {
  // Simple AI for GPT's play
  if (gptHand.length === 0) {
    console.error("GPT has no cards to play!");
    return null;
  }
  
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

export { makeGptPlay };
