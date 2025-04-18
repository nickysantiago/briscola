// game-state.js - Game state management and core functions

import { SUITS, VALUES, INITIAL_HAND_SIZE } from './constants.js';
import { renderGame, updateStatusDisplay } from './ui-renderer.js';

// Game state
let deck = [];
let playerHand = [];
let gptHand = [];
let playerPoints = 0;
let gptPoints = 0;
let trumpCard = null;
let playerLeads = true;
let isProcessingTrick = false;
let currentGptCard = null;
let statusMessage = "Game starting...";
let gameActive = false;

// Core game functions
function shuffleDeck() {
  deck = [];
  for (let suit of SUITS) {
    for (let value of VALUES) {
      deck.push({ suit, value });
    }
  }
  deck = deck.sort(() => Math.random() - 0.5);
}

function drawCard() {
  return deck.length ? deck.pop() : null;
}

function dealInitialHands() {
  playerHand = [];
  gptHand = [];
  
  for (let i = 0; i < INITIAL_HAND_SIZE; i++) {
    playerHand.push(drawCard());
    gptHand.push(drawCard());
  }
}

function startGame() {
  console.log("Starting game...");
  isProcessingTrick = false;
  currentGptCard = null;
  playerPoints = 0;
  gptPoints = 0;
  playerLeads = true;
  gameActive = true;
  
  // Remove title screen
  const titleScreen = document.getElementById('title-screen');
  if (titleScreen) {
    titleScreen.style.display = 'none';
  }
  
  // Show the footer with New Game button
  const footer = document.getElementById('game-footer');
  if (footer) {
    footer.classList.remove('hidden');
  }
  
  shuffleDeck();
  dealInitialHands();
  trumpCard = drawCard();
  
  statusMessage = "You lead the first trick";
  
  renderGame();
  
  console.log("Game initialized with:", {
    deckSize: deck.length,
    playerHandSize: playerHand.length,
    gptHandSize: gptHand.length,
    trumpCard: cardStr(trumpCard)
  });
}

function endGame() {
  gameActive = false;
  
  let result = playerPoints > gptPoints ? '🎉 You win!' : 
               playerPoints < gptPoints ? 'GPT wins 😢' : 
               'It\'s a tie!';
               
  // Use on-screen message instead of alert
  setStatusMessage(`Game Over! Final score: You: ${playerPoints} | GPT: ${gptPoints} | ${result}`);
  updateStatusDisplay(true);
  
  // Remove any remaining play field
  const playArea = document.getElementById('play-area');
  if (playArea) {
    playArea.innerHTML = '';
  }
  
  // Create game over display
  const gameOverDisplay = document.createElement('div');
  gameOverDisplay.className = 'play-field';
  gameOverDisplay.style.backgroundColor = playerPoints > gptPoints ? '#e8f5e9' : 
                                           playerPoints < gptPoints ? '#ffebee' : 
                                           '#e3f2fd';
  gameOverDisplay.innerHTML = `
    <h2>${result}</h2>
    <div style="margin: 10px 0; font-size: 1.2em;">
      <p>Your Points: ${playerPoints}</p>
      <p>GPT Points: ${gptPoints}</p>
    </div>
    <p style="margin-top: 15px;">Click "New Game" to play again</p>
  `;
  playArea.appendChild(gameOverDisplay);
  
  // Add pulsing effect to New Game button
  const newGameButton = document.getElementById('new-game');
  if (newGameButton) {
    newGameButton.classList.add('pulse');
  }
  
  // We do NOT auto-start a new game anymore
}

// Helper function for card string representation
function cardStr(card) {
  return card ? `${card.value} of ${card.suit}` : 'No card';
}

// Export state getters and functions
export {
  deck,
  playerHand,
  gptHand,
  playerPoints,
  gptPoints,
  trumpCard,
  playerLeads,
  isProcessingTrick,
  currentGptCard,
  gameActive,
  shuffleDeck,
  drawCard,
  dealInitialHands,
  startGame,
  endGame,
  cardStr
};

// Export setters and getters for state modification
export function setPlayerLeads(value) {
  playerLeads = value;
}

export function setIsProcessingTrick(value) {
  isProcessingTrick = value;
}

export function setCurrentGptCard(value) {
  currentGptCard = value;
}

export function incrementPlayerPoints(points) {
  playerPoints += points;
}

export function incrementGptPoints(points) {
  gptPoints += points;
}

export function addCardToPlayerHand(card) {
  playerHand.push(card);
}

export function addCardToGptHand(card) {
  gptHand.push(card);
}

export function removeCardFromPlayerHand(index) {
  return playerHand.splice(index, 1)[0];
}

export function removeCardFromGptHand(index) {
  return gptHand.splice(index, 1)[0];
}

// Status message handling
export function setStatusMessage(message) {
  statusMessage = message;
}

export function getStatusMessage() {
  return statusMessage;
}
