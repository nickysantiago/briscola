// main.js - Entry point for the application

import { startGame } from './game-state.js';
import { playCard } from './game-logic.js';

// Make playCard function available globally
window.playCard = playCard;

// Main initialization
document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM loaded - initializing game...");
  
  // Ensure the game div exists
  const gameDiv = document.getElementById('game');
  if (!gameDiv) {
    console.error("Game div not found!");
    return;
  }
  
  // Start the game
  try {
    startGame();
    console.log("Game started successfully");
  } catch (error) {
    console.error("Error starting game:", error);
    
    // Fallback rendering in case of error
    gameDiv.innerHTML = `
      <div style="text-align: center; margin-top: 20px; color: red;">
        <h2>Error loading game</h2>
        <p>${error.message}</p>
        <p>Please check the console for more details.</p>
      </div>
    `;
  }
});
