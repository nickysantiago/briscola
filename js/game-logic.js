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
  gameActive,
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
  removeCardFromPlayerHand
} from './game-state.js';
import { 
  renderGame, 
  createPlayField, 
  addPlayerCardToPlayField
} from './ui-renderer.js';
import { makeGptPlay } from './ai-player.js';

// Play card from player's hand
function playCard(index) {
  // Prevent playing if game is not active or during trick processing
  if (!gameActive || isProcessingTrick) {
    return;
  }
  
  setIsProcessingTrick(true);
  const playerCard = removeCardFromPlayerHand(index);
  
  // Get the card element and its position
  const selectedCard = document.querySelectorAll('.hand .card')[index];
  if (selectedCard) {
    // Get card position
    const cardRect = selectedCard.getBoundingClientRect();
    const cardTop = cardRect.top;
    const cardLeft = cardRect.left;
    
    // Create a "floating" card that moves to play area
    const floatingCard = document.createElement('div');
    floatingCard.className = `card ${playerCard.suit === trumpCard.suit ? 'trump' : ''}`;
    floatingCard.style.backgroundImage = `url('cards/${playerCard.value}_of_${playerCard.suit.toLowerCase()}.png')`;
    floatingCard.style.position = 'fixed';
    floatingCard.style.top = `${cardTop}px`;
    floatingCard.style.left = `${cardLeft}px`;
    floatingCard.style.zIndex = '100';
    floatingCard.innerHTML = `${playerCard.value} of ${playerCard.suit}`;
    document.body.appendChild(floatingCard);
    
    // Get play area position
    const playArea = document.getElementById('play-area');
    const playAreaRect = playArea.getBoundingClientRect();
    const destTop = playAreaRect.top + playAreaRect.height/2 - cardRect.height/2;
    const destLeft = playAreaRect.left + playAreaRect.width/2 - cardRect.width/2;
    
    // Animate the card
    setTimeout(() => {
      floatingCard.style.top = `${destTop}px`;
      floatingCard.style.left = `${destLeft}px`;
      
      // Wait for animation to complete
      setTimeout(() => {
        // Remove the floating card
        document.body.removeChild(floatingCard);
        
        // If player leads, create the play field with their card
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
      }, 500); // Time for animation completion
    }, 10); // Small delay to start animation
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
      console.log(`Player wins trick and gains ${trickPoints} points!`);
    } else {
      incrementGptPoints(trickPoints);
      console.log(`GPT wins trick and gains ${trickPoints} points.`);
    }
    
    // Clear the play area after a delay
    setTimeout(() => {
      document.getElementById('play-area').innerHTML = '';
      
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
        // Reset processing flag and render game for next trick
        setIsProcessingTrick(false);
        renderGame();
      }
    }, 1500); // Show the played cards for 1.5 seconds before clearing
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
