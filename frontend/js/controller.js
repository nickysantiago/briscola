// controller.js - Front-end controller. Wires user input and Socket.io events to
// the renderer and animation engine. Replaces the old inline <script> in index.html
// and the local game-logic/game-state calls: a card click now emits a socket event,
// and the server's responses drive the (unchanged) animations and rendering.

import { socket, emitNewGame, emitPlayCard, emitResume } from './net.js';
import { clientState, applySnapshot, getStoredGameId, clearStoredGameId } from './client-state.js';
import { renderGame, renderGameOver, createAiPlayField } from './ui-renderer.js';
import { playTrickAnimation } from './animations.js';

// UX lock (the former isProcessingTrick): blocks clicks while a trick animates.
// The server's seq turn-guard is the real authority; this is purely cosmetic.
let busy = false;
// The hand slot the human last clicked, used to anchor the fly-out animation.
let lastIndex = null;

// Exposed for the onclick="playCard(index)" attributes rendered by ui-renderer.
window.playCard = (index) => {
  if (busy) return;
  if (!clientState.gameActive) return;
  // The human may act when they lead, or when the AI has led and awaits a response.
  if (!clientState.playerLeads && !clientState.currentAiCard) return;
  busy = true;
  lastIndex = index;
  emitPlayCard(clientState.gameId, index, clientState.seq);
};

// Render the board (or the game-over panel) from the current snapshot. Used on
// new game and resume; mid-trick rendering is driven by the animation instead.
function renderFromSnapshot() {
  const footer = document.getElementById('game-footer');
  if (footer) footer.classList.remove('hidden');

  if (!clientState.gameActive) {
    renderGameOver();
    return;
  }
  renderGame();
  // If the AI has already led and is waiting on the human, show its card in place
  // (no flight — that already happened before the refresh).
  if (clientState.currentAiCard) {
    createAiPlayField(clientState.currentAiCard);
  }
}

// ---- Socket events ----------------------------------------------------------

socket.on('gameState', (snapshot) => {
  applySnapshot(snapshot);
  // While a trick is animating we only stash the settled state; the animation's
  // own clear+render step paints it at the right moment. Otherwise paint now.
  if (!busy) renderFromSnapshot();
});

socket.on('trickResolved', (outcome) => {
  playTrickAnimation(outcome, { clickedIndex: lastIndex }).then(() => {
    busy = false;
  });
});

socket.on('errorState', (err) => {
  busy = false;
  const code = err && err.code;
  if (code === 'stale') {
    // Out of sync (double-emit / reconnect) — re-pull authoritative state.
    const gid = getStoredGameId();
    if (gid) emitResume(gid);
  } else if (code === 'unknownGame') {
    // Saved game is gone (expired/cleared). Drop the id; the title screen stays.
    clearStoredGameId();
  }
  console.warn('[brisca] errorState:', code);
});

// ---- Title screen / new game wiring ----------------------------------------

function startNewGame(difficulty) {
  busy = false;
  const titleScreen = document.getElementById('title-screen');
  if (titleScreen) titleScreen.style.display = 'none';
  const footer = document.getElementById('game-footer');
  if (footer) footer.classList.remove('hidden');
  const newGameButton = document.getElementById('new-game');
  if (newGameButton) newGameButton.classList.remove('pulse');
  emitNewGame(difficulty);
}

function wireDifficultyButtons() {
  const easy = document.getElementById('easy-mode');
  const normal = document.getElementById('normal-mode');
  const hard = document.getElementById('hard-mode');
  if (easy) easy.addEventListener('click', () => startNewGame('easy'));
  if (normal) normal.addEventListener('click', () => startNewGame('normal'));
  if (hard) hard.addEventListener('click', () => startNewGame('hard'));
}

// Recreate/show the difficulty selection. Ported from the original index.html
// inline script (the title screen is wiped once a game's board has rendered).
function showDifficultySelection() {
  let titleScreen = document.getElementById('title-screen');
  if (!titleScreen) {
    const gameDiv = document.getElementById('game');
    if (!gameDiv) return;
    gameDiv.innerHTML = '';
    titleScreen = document.createElement('div');
    titleScreen.id = 'title-screen';
    titleScreen.innerHTML = `
      <h2>Welcome to Brisca</h2>
      <p>A traditional Spanish card game</p>
      <div id="difficulty-selection" style="margin-top: 30px;">
        <h3>Select Difficulty</h3>
        <div class="difficulty-buttons">
          <button id="easy-mode" class="difficulty-button easy">
            <span>Easy</span>
            <small>Random plays</small>
          </button>
          <button id="normal-mode" class="difficulty-button normal">
            <span>Normal</span>
            <small>Strategic plays</small>
          </button>
          <button id="hard-mode" class="difficulty-button hard">
            <span>Good Luck</span>
            <small>Expert strategy</small>
          </button>
        </div>
      </div>
    `;
    gameDiv.appendChild(titleScreen);
    wireDifficultyButtons();
  } else {
    titleScreen.style.display = 'flex';
    const startButton = document.getElementById('start-game');
    if (startButton) startButton.style.display = 'none';
    const difficultySelection = document.getElementById('difficulty-selection');
    if (difficultySelection) difficultySelection.style.display = 'block';
  }
}

function init() {
  const startButton = document.getElementById('start-game');
  if (startButton) {
    startButton.addEventListener('click', () => {
      startButton.style.display = 'none';
      const difficultySelection = document.getElementById('difficulty-selection');
      if (difficultySelection) difficultySelection.style.display = 'block';
    });
  }
  wireDifficultyButtons();

  const newGameButton = document.getElementById('new-game');
  if (newGameButton) {
    newGameButton.addEventListener('click', () => {
      showDifficultySelection();
      newGameButton.classList.remove('pulse');
    });
  }

  // Resume a saved game if one exists (refresh / reopened tab).
  const storedGameId = getStoredGameId();
  if (storedGameId) emitResume(storedGameId);
}

init();
