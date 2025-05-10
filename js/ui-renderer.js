// ui-renderer.js - UI rendering functions with enhanced animations

import { 
  playerHand, 
  gptHand, 
  playerPoints, 
  gptPoints, 
  trumpCard, 
  deck, 
  playerLeads, 
  isProcessingTrick,
  gameActive,
  setCurrentGptCard,
  setIsProcessingTrick,
  playerWonCards,
  gptWonCards,
  difficulty,
  getDifficultyName
} from './game-state.js';
import { makeGptPlay } from './ai-player.js';

function renderGame() {
  console.log("Rendering game...");
  const gameDiv = document.getElementById('game');
  
  if (!gameDiv) {
    console.error("Game div not found!");
    return;
  }
  
  // If no active game, don't render the game board
  if (!gameActive) {
    // Show the title screen if it's hidden
    const titleScreen = document.getElementById('title-screen');
    if (titleScreen && titleScreen.style.display === 'none') {
      titleScreen.style.display = 'flex';
    }
    return;
  }
  
  let trumpHtml = "";
  if (trumpCard) {
    trumpHtml = renderCardImage(trumpCard, -1, false);
  } else {
    trumpHtml = `<div class="card">No trump card</div>`;
    console.warn("No trump card found when rendering");
  }
  
  // Add winner pile indicators to the UI and turn indicator
  gameDiv.innerHTML = `
    <div class="game-info">
      <div class="game-info-item">
        <strong>Your Points:</strong> ${playerPoints}
      </div>
      <div class="game-info-item">
        <strong>GPT Points:</strong> ${gptPoints}
      </div>
      <div class="game-info-item">
        <strong>Deck:</strong> ${deck.length} | <strong>GPT Hand:</strong> ${gptHand.length}
      </div>
      <div class="game-info-item">
        <strong>Mode:</strong> <span class="difficulty-indicator ${difficulty}">${getDifficultyName()}</span>
      </div>
    </div>
    
    <div class="turn-indicator ${playerLeads ? 'player-turn' : 'gpt-turn'}">
      ${playerLeads ? "Your Turn" : "GPT's Turn"}
    </div>
    
    <div class="trump-card">
      <h3>Trump:</h3>
      ${trumpHtml}
    </div>
    
    <div class="play-area" id="play-area">
      <!-- Play field will appear here when cards are played -->
    </div>
    
    <!-- Add winner piles for animation targets with last trick cards -->
    <div class="winner-pile-player" id="player-pile">
      ${renderWonCards(playerWonCards)}
    </div>
    <div class="winner-pile-gpt" id="gpt-pile">
      ${renderWonCards(gptWonCards)}
    </div>
    
    <div class="hand">
      <h2>Your Hand (${playerHand.length}):</h2>
      <div class="cards-container ${playerLeads && !isProcessingTrick ? 'your-turn' : ''}">
        ${playerHand.map((card, index) => renderCard(card, index)).join('')}
      </div>
    </div>
  `;
  
  // Apply new-card animation to the last card in player's hand if it was just added
  if (playerHand.length > 0) {
    setTimeout(() => {
      const cards = document.querySelectorAll('.hand .card');
      if (cards.length > 0) {
        // Apply animation to the most recently added card (last card)
        cards[cards.length - 1].classList.add('new-card');
      }
    }, 100);
  }
  
  // Clear any play field from previous trick
  const oldPlayField = document.querySelector('.play-field');
  if (oldPlayField) {
    oldPlayField.remove();
  }
  
  // If GPT should lead, trigger its play automatically
  if (!playerLeads && !isProcessingTrick && gptHand.length > 0) {
    console.log("GPT leads, triggering play...");
    setIsProcessingTrick(true); // Prevent multiple plays
    setTimeout(() => {
      try {
        const gptCard = makeGptPlay();
        setCurrentGptCard(gptCard);
      } catch (err) {
        console.error("Error during GPT play:", err);
      } finally {
        setIsProcessingTrick(false);
      }
    }, 1000);
  }
  
  console.log("Game render complete");
}

function renderCard(card, index) {
  // Cards are always clickable when it's player's turn, either to lead or respond
  const clickable = !isProcessingTrick;
  return renderCardImage(card, index, clickable);
}

function renderCardImage(card, index, clickable) {
  if (!card) {
    console.error("Trying to render null or undefined card");
    return `<div class="card">Invalid Card</div>`;
  }
  
  const isTrump = trumpCard && card.suit === trumpCard.suit;
  const filename = `cards/${card.value}_of_${card.suit.toLowerCase()}.png`;
  
  // Use window.playCard to ensure it uses the global function
  return `
    <div class="card ${isTrump ? 'trump' : ''}" ${clickable ? `onclick="playCard(${index})"` : ''}
         style="background-image: url('${filename}')">
      ${card.value} of ${card.suit}
    </div>
  `;
}

function createPlayField(playerCard) {
  console.log("Creating play field with player card:", playerCard);
  let playField = document.createElement('div');
  playField.className = 'play-field';
  playField.innerHTML = `
    <div class="played-cards">
      <div class="player-played">
        <h4>Your Play:</h4>
        ${renderCardImage(playerCard, -1, false)}
      </div>
    </div>
  `;
  
  const playArea = document.getElementById('play-area');
  if (playArea) {
    playArea.innerHTML = ''; // Clear existing content
    playArea.appendChild(playField);
  } else {
    console.error("Play area not found when creating play field");
    document.getElementById('game').appendChild(playField);
  }
  
  return playField;
}

function addGptCardToPlayField(gptCard) {
  console.log("Adding GPT card to play field:", gptCard);
  const playField = document.querySelector('.play-field');
  if (playField) {
    playField.querySelector('.played-cards').innerHTML += `
      <div class="gpt-played">
        <h4>GPT's Play:</h4>
        ${renderCardImage(gptCard, -1, false)}
      </div>
    `;
  } else {
    console.error("Play field not found when adding GPT card");
  }
}

function createGptPlayField(gptCard) {
  console.log("Creating GPT play field with card:", gptCard);
  let playField = document.createElement('div');
  playField.className = 'play-field';
  playField.innerHTML = `
    <div class="played-cards">
      <div class="gpt-played">
        <h4>GPT's Play:</h4>
        <div class="card gpt-card-played ${gptCard.suit === trumpCard.suit ? 'trump' : ''}"
             style="background-image: url('cards/${gptCard.value}_of_${gptCard.suit.toLowerCase()}.png')">
          ${gptCard.value} of ${gptCard.suit}
        </div>
      </div>
    </div>
  `;
  
  const playArea = document.getElementById('play-area');
  if (playArea) {
    playArea.innerHTML = ''; // Clear existing content
    playArea.appendChild(playField);
  } else {
    console.error("Play area not found when creating GPT play field");
    document.getElementById('game').appendChild(playField);
  }
}

function addPlayerCardToPlayField(playerCard) {
  console.log("Adding player card to play field:", playerCard);
  const playField = document.querySelector('.play-field');
  if (playField) {
    playField.querySelector('.played-cards').innerHTML += `
      <div class="player-played">
        <h4>Your Play:</h4>
        ${renderCardImage(playerCard, -1, false)}
      </div>
    `;
  } else {
    console.error("Play field not found when adding player card");
  }
}

// New function to display point value during animation
function showPointsAnimation(points, x, y) {
  if (points <= 0) return;
  
  const pointsEl = document.createElement('div');
  pointsEl.className = 'points-popup';
  pointsEl.textContent = `+${points}`;
  pointsEl.style.left = `${x}px`;
  pointsEl.style.top = `${y}px`;
  document.body.appendChild(pointsEl);
  
  // Remove element after animation
  setTimeout(() => {
    document.body.removeChild(pointsEl);
  }, 1500);
}

// New function to render cards in the winner piles
function renderWonCards(cards) {
  if (!cards || cards.length === 0) {
    return '';
  }
  
  // Render each card with stacking effect
  let html = '';
  cards.forEach((card, index) => {
    // Skip if card is null or undefined
    if (!card) return;
    
    const isTrump = trumpCard && card.suit === trumpCard.suit;
    const filename = `cards/${card.value}_of_${card.suit.toLowerCase()}.png`;
    
    // Stack cards with offset
    const offsetTop = index * 15;
    const offsetLeft = index * 5;
    const zIndex = 5 + index;
    
    html += `
      <div class="card won-card ${isTrump ? 'trump' : ''}" 
           style="background-image: url('${filename}');
                  position: absolute;
                  top: ${offsetTop}px;
                  left: ${offsetLeft}px;
                  z-index: ${zIndex};
                  transform: rotate(${(Math.random() * 10 - 5)}deg);
                  width: 60px;
                  height: 90px;">
      </div>
    `;
  });
  
  return html;
}

export {
  renderGame,
  renderCard,
  renderCardImage,
  createPlayField,
  addGptCardToPlayField,
  createGptPlayField,
  addPlayerCardToPlayField,
  showPointsAnimation,
  renderWonCards
};
