// ui-renderer.js - UI rendering functions

import { 
  playerHand, 
  gptHand, 
  playerPoints, 
  gptPoints, 
  trumpCard, 
  deck, 
  playerLeads, 
  isProcessingTrick,
  setCurrentGptCard,
  setIsProcessingTrick
} from './game-state.js';
import { makeGptPlay } from './ai-player.js';

function renderGame() {
  const gameDiv = document.getElementById('game');
  gameDiv.innerHTML = `
    <div class="trump-card">
      <h3>Trump Card:</h3>
      ${renderCardImage(trumpCard, -1, false)}
    </div>
    <div class="hand">
      <h2>Your Hand (${playerHand.length}):</h2>
      ${playerHand.map((card, index) => renderCard(card, index)).join('')}
    </div>
    <div class="gpt-hand-info">
      <h2>GPT's Hand: ${gptHand.length} cards</h2>
    </div>
    <div class="field">
      <h3>Your Points: ${playerPoints} | GPT Points: ${gptPoints}</h3>
      <h4>Cards left in deck: ${deck.length}</h4>
    </div>
    <div class="status">
      ${playerLeads ? "You lead the next trick" : "GPT leads the next trick"}
    </div>
  `;
  
  // Clear any play field from previous trick
  const oldPlayField = document.querySelector('.play-field');
  if (oldPlayField) {
    oldPlayField.remove();
  }
  
  // If GPT should lead, trigger its play automatically
  if (!playerLeads && !isProcessingTrick) {
    setIsProcessingTrick(true); // Prevent multiple plays
    setTimeout(() => {
      const gptCard = makeGptPlay();
      setCurrentGptCard(gptCard);
      setIsProcessingTrick(false);
    }, 1000);
  }
}

function renderCard(card, index) {
  // Cards are always clickable when it's player's turn, either to lead or respond
  const clickable = !isProcessingTrick;
  return renderCardImage(card, index, clickable);
}

function renderCardImage(card, index, clickable) {
  const isTrump = card.suit === trumpCard.suit;
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
  document.getElementById('game').appendChild(playField);
  return playField;
}

function addGptCardToPlayField(gptCard) {
  const playField = document.querySelector('.play-field');
  playField.querySelector('.played-cards').innerHTML += `
    <div class="gpt-played">
      <h4>GPT's Play:</h4>
      ${renderCardImage(gptCard, -1, false)}
    </div>
  `;
}

function createGptPlayField(gptCard) {
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
  document.getElementById('game').appendChild(playField);
}

function addPlayerCardToPlayField(playerCard) {
  const playField = document.querySelector('.play-field');
  playField.querySelector('.played-cards').innerHTML += `
    <div class="player-played">
      <h4>Your Play:</h4>
      ${renderCardImage(playerCard, -1, false)}
    </div>
  `;
}

export {
  renderGame,
  renderCard,
  renderCardImage,
  createPlayField,
  addGptCardToPlayField,
  createGptPlayField,
  addPlayerCardToPlayField
};
