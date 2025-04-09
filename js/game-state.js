// game-state.js - Game state management and core functions

import { SUITS, VALUES, INITIAL_HAND_SIZE } from './constants.js';
import { renderGame } from './ui-renderer.js';
import { makeGptPlay } from './ai-player.js';

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
  isProcessingTrick = false;
  currentGptCard = null;
  playerPoints = 0;
  gptPoints = 0;
  playerLeads = true;
  
  shuffleDeck();
  dealInitialHands();
  trumpCard = drawCard();
  
  statusMessage = "You lead the first trick";
  
  renderGame();
  
  // If GPT should lead first, trigger its play automatically
  if (!playerLeads) {
    statusMessage = "GPT leads the first trick";
    setTimeout(() => {
      if (!isProcessingTrick) {
        makeGptPlay();
      }
    }, 1000);
  }
}

function endGame() {
  let result = playerPoints > gptPoints ? '🎉 You win!' : 
               playerPoints < gptPoints ? 'GPT wins 😢' : 
               'It\'s a tie!';
               
  // Use on-screen message instead of alert
  statusMessage = `Game Over! Final score: You: ${playerPoints} | GPT: ${gptPoints} | ${result}`;
  renderGame();
  
  setTimeout(() => {
    startGame();
  }, 3000);
}

// Helper function for card string representation
function cardStr(card) {
  return `${card.value} of ${card.suit}`;
}

// Export state and functions
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
  shuffleDeck,
  drawCard,
  dealInitialHands,
  startGame,
  endGame,
  cardStr
};

// Export setters for state modification
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
