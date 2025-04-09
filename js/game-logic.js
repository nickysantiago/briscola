// game-logic.js - Game rules and logic

import { 
  VALUE_POINTS, 
  RANK_MAP, 
  CARD_ANIMATION_DELAY 
} from './constants.js';
import { 
  trumpCard, 
  playerLeads,
  isProcessingTrick,
  currentGptCard,
  deck, 
  playerHand, 
  gptHand,
  setPlayerLeads,
  setIsProcessingTrick,
  setCurrentGptCard,
  incrementPlayerPoints,
  incrementGptPoints,
  addCardToPlayerHand,
  addCardToGptHand,
  drawCard,
  endGame,
  removeCardFromPlayerHand,
  setStatusMessage
} from './game-state.js';
import { 
  renderGame, 
  createPlayField, 
  addPlayerCardToPlayField,
  updateStatusDisplay 
} from './ui-renderer.js';
import { makeGptPlay } from './ai-player.js';

// Play card from player's hand
function playCard(index) {
  // Prevent playing during trick processing
  if (isProcessingTrick) {
    return;
  }
  
  setIsProcessingTrick(true);
  const playerCard = removeCardFromPlayerHand(index);
  
  // Create card animation effect
  const selectedCard = document.querySelectorAll('.hand .card')[index];
  if (selectedCard) {
    selectedCard.classList.add('play-animation');
    
    // Wait for animation before proceeding
    setTimeout(() => {
      // If player leads, show their card first
      if (playerLeads) {
        createPlayField(playerCard);
        
        // Small delay before GPT plays
        setTimeout(() => {
          const gptCard = makeGptPlay(playerCard);
          finishTrick(playerCard, gptCard);
        }, CARD_ANIMATION_DELAY);
      } else {
        // If GPT led, player is responding to stored GPT card
        if (!currentGptCard) {
          console.error("No GPT card found!");
          setIsProcessingTrick(false);
          return;
        }
        
        // Add player's card to the play field
        addPlayerCardToPlayField(playerCard);
        
        // Finish the trick
        finishTrick(playerCard, currentGptCard);
        setCurrentGptCard(null); // Clear current GPT card
      }
    }, 500); // Time to match the animation duration
  }
}

function finishTrick(playerCard, gptCard) {
  const winner = determineWinner(playerCard, gptCard);
  const trickPoints = (VALUE_POINTS[playerCard.value] || 0) + (VALUE_POINTS[gptCard.value] || 0);
  
  // Update who leads next based on who won
  setPlayerLeads(winner === 'player');
  
  setTimeout(() => {
    if (winner === 'player') {
      incrementPlayerPoints(trickPoints);
      // Show message on screen instead of alert
      setStatusMessage(`You win the trick and gain ${trickPoints} points!`);
      updateStatusDisplay(true);
    } else {
      incrementGptPoints(trickPoints);
      // Show message on screen instead of alert
      setStatusMessage(`GPT wins the trick and gains ${trickPoints} points.`);
      updateStatusDisplay(true);
    }
    
    // Draw new cards if any remain
    if (deck.length >= 2) {
      // Enough cards for both players
      if (playerLeads) {
        addCardToPlayerHand(drawCard());
        addCardToGptHand(drawCard());
      } else {
        addCardToGptHand(drawCard());
        addCardToPlayerHand(drawCard());
      }
    } else if (deck.length === 1) {
      // Only one card left - give it to the trick winner
      if (playerLeads) {
        addCardToPlayerHand(drawCard());
        addCardToGptHand(trumpCard);
      } else {
        addCardToGptHand(drawCard());
        addCardToPlayerHand(trumpCard);
      }
    }
   
    // Check if game is over
    if (playerHand.length === 0 && gptHand.length === 0) {
      endGame();
    } else {
      // Set a timeout to reset the status message
      setTimeout(() => {
        setStatusMessage(playerLeads ? "You lead the next trick" : "GPT leads the next trick");
        updateStatusDisplay(false);
        setIsProcessingTrick(false); // Reset processing flag
        renderGame();
      }, 2000); // Show message for 2 seconds
    }
  }, CARD_ANIMATION_DELAY);
}

function determineWinner(playerCard, gptCard) {
  // First player leads with their suit (unless trump is played)
  const leadSuit = playerLeads ? playerCard.suit : gptCard.suit;
  
  // Both played trump suit
  if (playerCard.suit === trumpCard.suit && gptCard.suit === trumpCard.suit) {
    // Higher card in trump suit wins
    return getCardRank(playerCard) > getCardRank(gptCard) ? 'player' : 'gpt';
  }
  
  // Only player played trump
  if (playerCard.suit === trumpCard.suit) {
    return 'player';
  }
  
  // Only GPT played trump
  if (gptCard.suit === trumpCard.suit) {
    return 'gpt';
  }
  
  // Nobody played trump - winner is whoever played higher card of the lead suit
  if (playerLeads) {
    // Player led, GPT must follow suit to win
    if (gptCard.suit === leadSuit) {
      return getCardRank(playerCard) > getCardRank(gptCard) ? 'player' : 'gpt';
    }
    return 'player'; // GPT didn't follow suit and didn't play trump
  } else {
    // GPT led, player must follow suit to win
    if (playerCard.suit === leadSuit) {
      return getCardRank(playerCard) > getCardRank(gptCard) ? 'player' : 'gpt';
    }
    return 'gpt'; // Player didn't follow suit and didn't play trump
  }
}

// Get the rank of a card (higher number = stronger card)
function getCardRank(card) {
  return RANK_MAP[card.value];
}

export {
  playCard,
  finishTrick,
  determineWinner,
  getCardRank
};
