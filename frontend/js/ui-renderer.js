// ui-renderer.js - UI rendering functions with enhanced animations.
//
// Rewired for the backend migration: this module now reads from the client-side
// `clientState` (populated by Socket.io `gameState` snapshots) instead of the
// former game-state.js, and it no longer triggers AI moves (the server decides
// those, and animations.js drives the AI's card flights). Every piece of DOM
// building and every CSS class is unchanged from the pre-migration version, so the
// board looks identical. `gptHand.length` / `deck.length` became the public
// counts `gptHandCount` / `deckCount`.

import { clientState } from './client-state.js';

function getDifficultyName() {
  switch (clientState.difficulty) {
    case 'easy': return 'Easy';
    case 'normal': return 'Normal';
    case 'hard': return 'Hard';
    default: return 'Normal';
  }
}

function renderGame() {
  const gameDiv = document.getElementById('game');
  if (!gameDiv) {
    console.error('Game div not found!');
    return;
  }
  if (!clientState.playerHand) return; // no game loaded yet

  let trumpHtml = '';
  if (clientState.trumpCard) {
    trumpHtml = renderCardImage(clientState.trumpCard, -1, false);
  } else {
    trumpHtml = `<div class="card">No trump card</div>`;
  }

  gameDiv.innerHTML = `
    <div class="game-info">
      <div class="game-info-item">
        <strong>Your Points:</strong> ${clientState.playerPoints}
      </div>
      <div class="game-info-item">
        <strong>GPT Points:</strong> ${clientState.gptPoints}
      </div>
      <div class="game-info-item">
        <strong>Deck:</strong> ${clientState.deckCount} | <strong>GPT Hand:</strong> ${clientState.gptHandCount}
      </div>
      <div class="game-info-item">
        <strong>Mode:</strong> <span class="difficulty-indicator ${clientState.difficulty}">${getDifficultyName()}</span>
      </div>
    </div>

    <div class="turn-indicator ${clientState.playerLeads ? 'player-turn' : 'gpt-turn'}">
      ${clientState.playerLeads ? "Your Turn" : "GPT's Turn"}
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
      ${renderWonCards(clientState.playerWonCards)}
    </div>
    <div class="winner-pile-gpt" id="gpt-pile">
      ${renderWonCards(clientState.gptWonCards)}
    </div>

    <div class="hand">
      <h2>Your Hand (${clientState.playerHand.length}):</h2>
      <div class="cards-container ${clientState.playerLeads ? 'your-turn' : ''}">
        ${clientState.playerHand.map((card, index) => renderCard(card, index)).join('')}
      </div>
    </div>
  `;

  // Apply new-card animation to the last card in the player's hand if it was just added
  if (clientState.playerHand.length > 0) {
    setTimeout(() => {
      const cards = document.querySelectorAll('.hand .card');
      if (cards.length > 0) {
        cards[cards.length - 1].classList.add('new-card');
      }
    }, 100);
  }

  // Clear any play field from a previous trick
  const oldPlayField = document.querySelector('.play-field');
  if (oldPlayField) {
    oldPlayField.remove();
  }
}

// Render the game-over panel. Ported from the original game-state.js endGame().
// On a fresh-load resume of a finished game the board has not been built yet, so
// build it first; mid-game (the trick that ended the game) the board already
// exists and we only drop the panel into the play area, matching the original.
function renderGameOver() {
  let playArea = document.getElementById('play-area');
  if (!playArea) {
    renderGame();
    playArea = document.getElementById('play-area');
  }
  if (!playArea) return;
  playArea.innerHTML = '';

  const playerPoints = clientState.playerPoints;
  const gptPoints = clientState.gptPoints;

  const gameOverDisplay = document.createElement('div');
  gameOverDisplay.className = 'play-field';
  gameOverDisplay.style.backgroundColor = playerPoints > gptPoints ? '#e8f5e9' :
                                          playerPoints < gptPoints ? '#ffebee' :
                                          '#e3f2fd';

  const result = playerPoints > gptPoints ? '🎉 You win!' :
                 playerPoints < gptPoints ? 'GPT wins 😢' :
                 'It\'s a tie!';

  gameOverDisplay.innerHTML = `
    <h2>${result}</h2>
    <div style="margin: 10px 0; font-size: 1.2em;">
      <p>Your Points: ${playerPoints}</p>
      <p>GPT Points: ${gptPoints}</p>
    </div>
    <div class="difficulty-played">
      <p>Difficulty: <span class="difficulty-indicator ${clientState.difficulty}">${getDifficultyName()}</span></p>
    </div>
    <p style="margin-top: 15px;">Click "New Game" to play again</p>
  `;
  playArea.appendChild(gameOverDisplay);

  const newGameButton = document.getElementById('new-game');
  if (newGameButton) {
    newGameButton.classList.add('pulse');
  }
}

function renderCard(card, index) {
  // Hand cards are clickable; the controller's window.playCard guards illegal/locked clicks.
  return renderCardImage(card, index, true);
}

function renderCardImage(card, index, clickable) {
  if (!card) {
    console.error('Trying to render null or undefined card');
    return `<div class="card">Invalid Card</div>`;
  }

  const trumpCard = clientState.trumpCard;
  const isTrump = trumpCard && card.suit === trumpCard.suit;
  const filename = `cards/${card.value}_of_${card.suit.toLowerCase()}.png`;

  return `
    <div class="card ${isTrump ? 'trump' : ''}" ${clickable ? `onclick="playCard(${index})"` : ''}
         style="background-image: url('${filename}')">
      ${card.value} of ${card.suit}
    </div>
  `;
}

function createPlayField(playerCard) {
  const playField = document.createElement('div');
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
    playArea.innerHTML = '';
    playArea.appendChild(playField);
  } else {
    console.error('Play area not found when creating play field');
    document.getElementById('game').appendChild(playField);
  }

  return playField;
}

function addGptCardToPlayField(gptCard) {
  const playField = document.querySelector('.play-field');
  if (playField) {
    playField.querySelector('.played-cards').innerHTML += `
      <div class="gpt-played">
        <h4>GPT's Play:</h4>
        ${renderCardImage(gptCard, -1, false)}
      </div>
    `;
  } else {
    console.error('Play field not found when adding GPT card');
  }
}

function createGptPlayField(gptCard) {
  const trumpCard = clientState.trumpCard;
  const playField = document.createElement('div');
  playField.className = 'play-field';
  playField.innerHTML = `
    <div class="played-cards">
      <div class="gpt-played">
        <h4>GPT's Play:</h4>
        <div class="card gpt-card-played ${trumpCard && gptCard.suit === trumpCard.suit ? 'trump' : ''}"
             style="background-image: url('cards/${gptCard.value}_of_${gptCard.suit.toLowerCase()}.png')">
          ${gptCard.value} of ${gptCard.suit}
        </div>
      </div>
    </div>
  `;

  const playArea = document.getElementById('play-area');
  if (playArea) {
    playArea.innerHTML = '';
    playArea.appendChild(playField);
  } else {
    console.error('Play area not found when creating GPT play field');
    document.getElementById('game').appendChild(playField);
  }
}

function addPlayerCardToPlayField(playerCard) {
  const playField = document.querySelector('.play-field');
  if (playField) {
    playField.querySelector('.played-cards').innerHTML += `
      <div class="player-played">
        <h4>Your Play:</h4>
        ${renderCardImage(playerCard, -1, false)}
      </div>
    `;
  } else {
    console.error('Play field not found when adding player card');
  }
}

// Display a "+points" popup near a target position.
function showPointsAnimation(points, x, y) {
  if (points <= 0) return;

  const pointsEl = document.createElement('div');
  pointsEl.className = 'points-popup';
  pointsEl.textContent = `+${points}`;
  pointsEl.style.left = `${x}px`;
  pointsEl.style.top = `${y}px`;
  document.body.appendChild(pointsEl);

  setTimeout(() => {
    document.body.removeChild(pointsEl);
  }, 1500);
}

// Render cards in a winner pile (stacked, slightly rotated).
function renderWonCards(cards) {
  if (!cards || cards.length === 0) {
    return '';
  }

  const trumpCard = clientState.trumpCard;
  let html = '';
  cards.forEach((card, index) => {
    if (!card) return;

    const isTrump = trumpCard && card.suit === trumpCard.suit;
    const filename = `cards/${card.value}_of_${card.suit.toLowerCase()}.png`;

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
  renderGameOver,
  renderCard,
  renderCardImage,
  createPlayField,
  addGptCardToPlayField,
  createGptPlayField,
  addPlayerCardToPlayField,
  showPointsAnimation,
  renderWonCards
};
