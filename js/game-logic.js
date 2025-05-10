// game-logic.js - Game rules and logic with card animations

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
  addPlayerCardToPlayField,
  showPointsAnimation
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
      animateCardsToWinner('player', trickPoints);
    } else {
      incrementGptPoints(trickPoints);
      console.log(`GPT wins trick and gains ${trickPoints} points.`);
      animateCardsToWinner('gpt', trickPoints);
    }
    
    // We will NOT clear the play area immediately - it will be cleared after animations
    // Draw new cards and continue game will now happen in the animateCardsToWinner function
  }, CARD_ANIMATION_DELAY);
}

// New function to animate cards going to the winner
function animateCardsToWinner(winner, trickPoints) {
  // Get the played cards
  const playField = document.querySelector('.play-field');
  if (!playField) {
    console.error("Play field not found for animation");
    continueAfterAnimation();
    return;
  }
  
  const playedCards = playField.querySelectorAll('.card');
  if (playedCards.length === 0) {
    console.error("No played cards found for animation");
    continueAfterAnimation();
    return;
  }
  
  // Create status message to show who won
  const statusMessage = document.createElement('div');
  statusMessage.className = 'status highlight';
  statusMessage.textContent = winner === 'player' ? 
    `You win ${trickPoints} points!` : 
    `GPT wins ${trickPoints} points`;
  playField.appendChild(statusMessage);
  
  // Get the target pile element
  const targetPileId = winner === 'player' ? 'player-pile' : 'gpt-pile';
  const targetPile = document.getElementById(targetPileId);
  let targetRect = { top: 0, left: 0 };
  
  if (targetPile) {
    targetRect = targetPile.getBoundingClientRect();
  } else {
    // Fallback positions if piles aren't found
    targetRect = {
      top: winner === 'player' ? window.innerHeight - 100 : -50,
      left: window.innerWidth - 100
    };
  }
  
  // Show points animation near the target
  if (trickPoints > 0) {
    showPointsAnimation(
      trickPoints, 
      targetRect.left - 20, 
      winner === 'player' ? targetRect.top - 60 : targetRect.top + 60
    );
  }
  
  // Clone cards for animation
  const animatedCards = Array.from(playedCards).map(card => {
    const clone = card.cloneNode(true);
    clone.classList.add('animating');
    clone.style.position = 'fixed';
    const rect = card.getBoundingClientRect();
    clone.style.top = `${rect.top}px`;
    clone.style.left = `${rect.left}px`;
    clone.style.zIndex = '200';
    document.body.appendChild(clone);
    return clone;
  });
  
  // Set destination based on winner
  setTimeout(() => {
    animatedCards.forEach((card, index) => {
      // Add slight offset for each card so they stack
      const offsetX = Math.random() * 30 - 15;
      const offsetY = Math.random() * 20 - 10;
      
      if (winner === 'player') {
        // Move to player pile
        card.style.top = `${targetRect.top + offsetY}px`;
        card.style.left = `${targetRect.left + offsetX}px`;
        card.style.transform = 'rotate(' + (Math.random() * 40 - 20) + 'deg) scale(0.8)';
        card.style.opacity = '0.8';
      } else {
        // Move to GPT pile
        card.style.top = `${targetRect.top + offsetY}px`;
        card.style.left = `${targetRect.left + offsetX}px`;
        card.style.transform = 'rotate(' + (Math.random() * 40 - 20) + 'deg) scale(0.8)';
        card.style.opacity = '0.8';
      }
    });
    
    // Continue game after animation completes
    setTimeout(() => {
      // Remove animated cards
      animatedCards.forEach(card => document.body.removeChild(card));
      continueAfterAnimation();
    }, 800); // Match the transition time
  }, 1000); // Short delay before animation starts
}

function continueAfterAnimation() {
  // Clear the play area
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
