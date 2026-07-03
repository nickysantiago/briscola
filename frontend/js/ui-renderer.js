// ui-renderer.js - All DOM rendering, driven by the client-side snapshot.
//
// Reads from `clientState`, which is kept in sync by Socket.io `gameState`
// snapshots. The server never reveals the AI's hand or the deck contents, so
// the board shows the public counts `aiHandCount` / `deckCount` instead.

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
        <strong>AI Points:</strong> ${clientState.aiPoints}
      </div>
      <div class="game-info-item">
        <strong>Deck:</strong> ${clientState.deckCount} | <strong>AI Hand:</strong> ${clientState.aiHandCount}
      </div>
      <div class="game-info-item">
        <strong>Mode:</strong> <span class="difficulty-indicator ${clientState.difficulty}">${getDifficultyName()}</span>
      </div>
    </div>

    <div class="turn-indicator ${clientState.playerLeads ? 'player-turn' : 'ai-turn'}">
      ${clientState.playerLeads ? "Your Turn" : "AI's Turn"}
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
    <div class="winner-pile-ai" id="ai-pile">
      ${renderWonCards(clientState.aiWonCards)}
    </div>

    <div class="hand">
      <h2>Your Hand (${clientState.playerHand.length}):</h2>
      <div class="cards-container ${clientState.playerLeads ? 'your-turn' : ''}">
        ${clientState.playerHand.map((card, index) => renderCardImage(card, index, true)).join('')}
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

// Render the game-over panel. On a fresh-load resume of a finished game the
// board has not been built yet, so build it first; mid-game (the trick that
// ended the game) the board already exists and only the panel is dropped in.
function renderGameOver() {
  let playArea = document.getElementById('play-area');
  if (!playArea) {
    renderGame();
    playArea = document.getElementById('play-area');
  }
  if (!playArea) return;
  playArea.innerHTML = '';

  const playerPoints = clientState.playerPoints;
  const aiPoints = clientState.aiPoints;

  const gameOverDisplay = document.createElement('div');
  gameOverDisplay.className = 'play-field';
  gameOverDisplay.style.backgroundColor = playerPoints > aiPoints ? '#e8f5e9' :
                                          playerPoints < aiPoints ? '#ffebee' :
                                          '#e3f2fd';

  const result = playerPoints > aiPoints ? '🎉 You win!' :
                 playerPoints < aiPoints ? 'AI wins 😢' :
                 'It\'s a tie!';

  gameOverDisplay.innerHTML = `
    <h2>${result}</h2>
    <div style="margin: 10px 0; font-size: 1.2em;">
      <p>Your Points: ${playerPoints}</p>
      <p>AI Points: ${aiPoints}</p>
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

// Clickable hand cards get an onclick that calls the controller's global
// playCard(index), which guards illegal/locked clicks.
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

function addAiCardToPlayField(aiCard) {
  const playField = document.querySelector('.play-field');
  if (playField) {
    playField.querySelector('.played-cards').innerHTML += `
      <div class="ai-played">
        <h4>AI's Play:</h4>
        ${renderCardImage(aiCard, -1, false)}
      </div>
    `;
  } else {
    console.error('Play field not found when adding AI card');
  }
}

function createAiPlayField(aiCard) {
  const trumpCard = clientState.trumpCard;
  const playField = document.createElement('div');
  playField.className = 'play-field';
  playField.innerHTML = `
    <div class="played-cards">
      <div class="ai-played">
        <h4>AI's Play:</h4>
        <div class="card ai-card-played ${trumpCard && aiCard.suit === trumpCard.suit ? 'trump' : ''}"
             style="background-image: url('cards/${aiCard.value}_of_${aiCard.suit.toLowerCase()}.png')">
          ${aiCard.value} of ${aiCard.suit}
        </div>
      </div>
    </div>
  `;

  const playArea = document.getElementById('play-area');
  if (playArea) {
    playArea.innerHTML = '';
    playArea.appendChild(playField);
  } else {
    console.error('Play area not found when creating AI play field');
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
  createPlayField,
  addAiCardToPlayField,
  createAiPlayField,
  addPlayerCardToPlayField,
  showPointsAnimation
};
