const suits = ['Oros', 'Copas', 'Espadas', 'Bastos'];
const values = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
const valuePoints = { 1: 11, 3: 10, 12: 4, 11: 3, 10: 2 };

let deck = [];
let playerHand = [];
let gptHand = [];
let playerPoints = 0;
let gptPoints = 0;
let trumpCard;
let playerLeads = true; // Track who leads the next trick
let isProcessingTrick = false; // Flag to prevent multiple plays
let currentGptCard = null; // Store the current GPT card when it leads

function shuffleDeck() {
  deck = [];
  for (let suit of suits) {
    for (let value of values) {
      deck.push({ suit, value });
    }
  }
  deck = deck.sort(() => Math.random() - 0.5);
}

function drawCard() {
  return deck.length ? deck.pop() : null;
}

function dealInitialHands() {
  playerHand = [drawCard(), drawCard(), drawCard()];
  gptHand = [drawCard(), drawCard(), drawCard()];
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
  renderGame();
  
  // If GPT should lead first, trigger its play automatically
  if (!playerLeads) {
    setTimeout(() => {
      if (!isProcessingTrick) {
        makeGptPlay();
      }
    }, 1000);
  }
}

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
    isProcessingTrick = true; // Prevent multiple plays
    setTimeout(() => {
      currentGptCard = makeGptPlay();
      isProcessingTrick = false;
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
  return `
    <div class="card ${isTrump ? 'trump' : ''}" ${clickable ? `onclick="playCard(${index})"` : ''}
         style="background-image: url('${filename}')">
      ${card.value} of ${card.suit}
    </div>
  `;
}

function playCard(index) {
  // Prevent playing during trick processing
  if (isProcessingTrick) {
    return;
  }
  
  isProcessingTrick = true;
  const playerCard = playerHand.splice(index, 1)[0];
  
  // If player leads, show their card first
  if (playerLeads) {
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
    
    // Small delay before GPT plays
    setTimeout(() => {
      const gptCard = makeGptPlay(playerCard);
      finishTrick(playerCard, gptCard);
    }, 1000);
  } else {
    // If GPT led, player is responding to stored GPT card
    if (!currentGptCard) {
      console.error("No GPT card found!");
      isProcessingTrick = false;
      return;
    }
    
    // Add player's card to the play field
    const playField = document.querySelector('.play-field');
    playField.querySelector('.played-cards').innerHTML += `
      <div class="player-played">
        <h4>Your Play:</h4>
        ${renderCardImage(playerCard, -1, false)}
      </div>
    `;
    
    // Finish the trick
    finishTrick(playerCard, currentGptCard);
    currentGptCard = null; // Clear current GPT card
  }
}

function makeGptPlay(playerCard = null) {
  // Simple AI for GPT's play
  if (gptHand.length === 0) {
    console.error("GPT has no cards to play!");
    return null;
  }
  
  let gptCardIndex;
  
  if (!playerLeads) {
    // GPT leads - plays a random card
    gptCardIndex = Math.floor(Math.random() * gptHand.length);
  } else {
    // GPT responds to player's lead
    // Try to win with lowest winning card, or play lowest card if can't win
    const trumpsInHand = gptHand.filter(c => c.suit === trumpCard.suit);
    const sameSuitCards = gptHand.filter(c => c.suit === playerCard.suit);
    
    if (playerCard.suit === trumpCard.suit && sameSuitCards.length > 0) {
      // Player played trump, try to win with higher trump or lose with lowest
      const winningTrumps = sameSuitCards.filter(c => 
        getCardRank(c) > getCardRank(playerCard));
      
      if (winningTrumps.length > 0) {
        // Play lowest winning trump
        const lowestWinner = winningTrumps.reduce((lowest, current) => 
          getCardRank(current) < getCardRank(lowest) ? current : lowest, winningTrumps[0]);
        gptCardIndex = gptHand.indexOf(lowestWinner);
      } else {
        // Can't win, play lowest card
        const lowestCard = sameSuitCards.reduce((lowest, current) => 
          getCardRank(current) < getCardRank(lowest) ? current : lowest, sameSuitCards[0]);
        gptCardIndex = gptHand.indexOf(lowestCard);
      }
    } else if (playerCard.suit !== trumpCard.suit && trumpsInHand.length > 0) {
      // Player didn't play trump, GPT can win with any trump
      const lowestTrump = trumpsInHand.reduce((lowest, current) => 
        getCardRank(current) < getCardRank(lowest) ? current : lowest, trumpsInHand[0]);
      gptCardIndex = gptHand.indexOf(lowestTrump);
    } else if (sameSuitCards.length > 0) {
      // Try to win with same suit
      const winningCards = sameSuitCards.filter(c => 
        getCardRank(c) > getCardRank(playerCard));
      
      if (winningCards.length > 0) {
        // Play lowest winning card
        const lowestWinner = winningCards.reduce((lowest, current) => 
          getCardRank(current) < getCardRank(lowest) ? current : lowest, winningCards[0]);
        gptCardIndex = gptHand.indexOf(lowestWinner);
      } else {
        // Can't win, play lowest card
        const lowestCard = sameSuitCards.reduce((lowest, current) => 
          getCardRank(current) < getCardRank(lowest) ? current : lowest, sameSuitCards[0]);
        gptCardIndex = gptHand.indexOf(lowestCard);
      }
    } else {
      // Can't win, throw lowest value card
      const lowestValueCard = gptHand.reduce((lowest, current) => {
        const currentPoints = valuePoints[current.value] || 0;
        const lowestPoints = valuePoints[lowest.value] || 0;
        return currentPoints < lowestPoints ? current : lowest;
      }, gptHand[0]);
      gptCardIndex = gptHand.indexOf(lowestValueCard);
    }
  }
  
  const gptCard = gptHand.splice(gptCardIndex, 1)[0];
  
  // If GPT leads, display its card
  if (!playerLeads) {
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
    return gptCard; // Return card but don't finish trick yet - player needs to respond
  }
  
  // Update the play field with GPT's card when responding to player
  const playField = document.querySelector('.play-field');
  playField.querySelector('.played-cards').innerHTML += `
    <div class="gpt-played">
      <h4>GPT's Play:</h4>
      ${renderCardImage(gptCard, -1, false)}
    </div>
  `;
  
  return gptCard;
}

function finishTrick(playerCard, gptCard) {
  const winner = determineWinner(playerCard, gptCard);
  const trickPoints = (valuePoints[playerCard.value] || 0) + (valuePoints[gptCard.value] || 0);
  
  // Update who leads next based on who won
  playerLeads = winner === 'player';
  
  setTimeout(() => {
    if (winner === 'player') {
      playerPoints += trickPoints;
      alert(`You win the trick and gain ${trickPoints} points!`);
    } else {
      gptPoints += trickPoints;
      alert(`GPT wins the trick and gains ${trickPoints} points.`);
    }
    
  // Draw new cards if any remain
  if (deck.length >= 2) {
    // Enough cards for both players
    if (playerLeads) {
      playerHand.push(drawCard());
      gptHand.push(drawCard());
    } else {
      gptHand.push(drawCard());
      playerHand.push(drawCard());
    }
  } else if (deck.length === 1) {
    // Only one card left - give it to the trick winner
    if (playerLeads) {
    playerHand.push(drawCard());
    gptHand.push(trumpCard);
    } else {
    gptHand.push(drawCard());
    playerHand.push(trumpCard);
    }
  }
 
    // Check if game is over
    if (playerHand.length === 0 && gptHand.length === 0) {
      endGame();
    } else {
      isProcessingTrick = false; // Reset processing flag
      renderGame();
    }
  }, 1000);
}

function determineWinner(playerCard, gptCard) {
  // First player leads with their suit (unless trump is played)
  const leadSuit = playerLeads ? playerCard.suit : gptCard.suit;
  
  // Both played trump suit
  if (playerCard.suit === trumpCard.suit && gptCard.suit === trumpCard.suit) {
    // Higher card in trump suit wins
    return getCardRank(playerCard) > getCardRank(gptCard) ? 'player' : 'gpt';
  }
  
  // Only player played trump
  if (playerCard.suit === trumpCard.suit) {
    return 'player';
  }
  
  // Only GPT played trump
  if (gptCard.suit === trumpCard.suit) {
    return 'gpt';
  }
  
  // Nobody played trump - winner is whoever played higher card of the lead suit
  if (playerLeads) {
    // Player led, GPT must follow suit to win
    if (gptCard.suit === leadSuit) {
      return getCardRank(playerCard) > getCardRank(gptCard) ? 'player' : 'gpt';
    }
    return 'player'; // GPT didn't follow suit and didn't play trump
  } else {
    // GPT led, player must follow suit to win
    if (playerCard.suit === leadSuit) {
      return getCardRank(playerCard) > getCardRank(gptCard) ? 'player' : 'gpt';
    }
    return 'gpt'; // Player didn't follow suit and didn't play trump
  }
}

// Helper function to get the rank of a card (higher number = stronger card)
function getCardRank(card) {
  // Brisca card ranking: Ace(1) is high, then 3, then King(12), Queen(11), Jack(10), then 7,6,5,4,2
  const rankMap = {1: 9, 3: 8, 12: 7, 11: 6, 10: 5, 7: 4, 6: 3, 5: 2, 4: 1, 2: 0};
  return rankMap[card.value];
}

function cardStr(card) {
  return `${card.value} of ${card.suit}`;
}

function endGame() {
  let result = playerPoints > gptPoints ? '🎉 You win!' : playerPoints < gptPoints ? 'GPT wins 😢' : 'It\'s a tie!';
  alert(`Game Over! Final score:\nYou: ${playerPoints}\nGPT: ${gptPoints}\n${result}`);
  setTimeout(() => {
    startGame();
  }, 500);
}

startGame();
