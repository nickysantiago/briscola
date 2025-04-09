// constants.js - Game constants and configurations

const SUITS = ['Oros', 'Copas', 'Espadas', 'Bastos'];
const VALUES = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
const VALUE_POINTS = { 1: 11, 3: 10, 12: 4, 11: 3, 10: 2 };

// Card ranking: Ace(1) is high, then 3, then King(12), Queen(11), Jack(10), then 7,6,5,4,2
const RANK_MAP = {1: 9, 3: 8, 12: 7, 11: 6, 10: 5, 7: 4, 6: 3, 5: 2, 4: 1, 2: 0};

// Game settings
const INITIAL_HAND_SIZE = 3;
const CARD_ANIMATION_DELAY = 1000; // milliseconds

export { 
  SUITS, 
  VALUES, 
  VALUE_POINTS, 
  RANK_MAP, 
  INITIAL_HAND_SIZE, 
  CARD_ANIMATION_DELAY 
};
