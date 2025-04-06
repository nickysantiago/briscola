const suits = ['Oros', 'Copas', 'Espadas', 'Bastos'];
const values = [1, 2, 3, 4, 5, 6, 7, 10, 11, 12];
const valuePoints = { 1: 11, 3: 10, 12: 4, 11: 3, 10: 2 };

let deck = [];
let playerHand = [];
let gptHand = [];
let playerPoints = 0;
let gptPoints = 0;
let trumpCard;

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
  shuffleDeck();
  dealInitialHands();
  trumpCard = drawCard();
  renderGame();
}

function renderGame() {
  const gameDiv = document.getElementById('game');
  gameDiv.innerHTML = `
    <h3>Trump Suit: ${trumpCard.suit}</h3>
    <div class="hand">
      <h2>Your Hand:</h2>
      ${playerHand.map((card, index) => renderCard(card, index)).join('')}
    </div>
    <div class="field">
      <h3>Your Points: ${playerPoints} | GPT Points: ${gptPoints}</h3>
    </div>
  `;
}

function renderCard(card, index) {
  const isTrump = card.suit === trumpCard.suit;
  const filename = `cards/${card.value}_of_${card.suit.toLowerCase()}.png`;
  return `
    <div class="card ${isTrump ? 'trump' : ''}" onclick="playCard(${index})"
         style="background-image: url('${filename}')">
      ${card.value} of ${card.suit}
    </div>
  `;
}

function playCard(index) {
  const playerCard = playerHand.splice(index, 1)[0];
  const gptCard = gptHand.splice(Math.floor(Math.random() * gptHand.length), 1)[0];

  const winner = determineWinner(playerCard, gptCard);
  const trickPoints = (valuePoints[playerCard.value] || 0) + (valuePoints[gptCard.value] || 0);

  if (winner === 'player') {
    playerPoints += trickPoints;
    alert(`You played ${cardStr(playerCard)}, GPT played ${cardStr(gptCard)}.\nYou win the trick and gain ${trickPoints} points!`);
  } else {
    gptPoints += trickPoints;
    alert(`You played ${cardStr(playerCard)}, GPT played ${cardStr(gptCard)}.\nGPT wins the trick and gains ${trickPoints} points.`);
  }

  if (deck.length > 0) {
    playerHand.push(drawCard());
    gptHand.push(drawCard());
  }

  if (playerHand.length === 0) {
    endGame();
  } else {
    renderGame();
  }
}

function determineWinner(p1, p2) {
  if (p1.suit === p2.suit) {
    return values.indexOf(p1.value) < values.indexOf(p2.value) ? 'player' : 'gpt';
  }
  if (p1.suit === trumpCard.suit) return 'player';
  if (p2.suit === trumpCard.suit) return 'gpt';
  return 'player';
}

function cardStr(card) {
  return `${card.value} of ${card.suit}`;
}

function endGame() {
  let result = playerPoints > gptPoints ? '🎉 You win!' : playerPoints < gptPoints ? 'GPT wins 😢' : 'It\'s a tie!';
  alert(`Game Over! Final score:\nYou: ${playerPoints}\nGPT: ${gptPoints}\n${result}`);
  startGame();
}

startGame();

