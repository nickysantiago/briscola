// main.js - Entry point for the application

import { startGame } from './game-state.js';
import { playCard } from './game-logic.js';

// Main initialization
document.addEventListener('DOMContentLoaded', () => {
  // Expose the playCard function to global scope for onclick handlers
  window.playCard = playCard;
  
  // Start the game
  startGame();
});
