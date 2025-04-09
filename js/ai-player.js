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
  
  // If GPT leads, display its card
  if (!playerLeads) {
    createGptPlayField(gptCard);
    return gptCard; // Return card but don't finish trick yet - player needs to respond
  }
  
  // Update the play field with GPT's card when responding to player
  addGptCardToPlayField(gptCard);
  
  return gptCard;
}

export { makeGptPlay };
