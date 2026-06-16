// animations.js - The card-movement animation engine.
//
// This is the DOM/animation half of the original game-logic.js + ai-player.js,
// relocated to the client and driven by the server's `trickResolved` outcome
// instead of by local game logic. Every floating-card flight, the won-cards
// fly-to-pile, the points popup, and — crucially — the exact setTimeout timings
// (10 / 500 / 800 / 1000 / CARD_ANIMATION_DELAY) are reproduced verbatim so the
// game looks and feels identical to the pre-migration build.
//
// There are two timing "chains", exactly as before:
//   - humanLed: player card flies in, pause, GPT response flies in, pause, resolve.
//   - human responds: the GPT card is already on the field; the player's card flies
//     in next to it, pause, resolve. (~1s shorter — matches the original.)

import { CARD_ANIMATION_DELAY } from './constants.js';
import { clientState } from './client-state.js';
import {
  createPlayField,
  addPlayerCardToPlayField,
  addGptCardToPlayField,
  createGptPlayField,
  showPointsAnimation,
  renderGame,
  renderGameOver
} from './ui-renderer.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const cardImg = (card) => `cards/${card.value}_of_${card.suit.toLowerCase()}.png`;

// Fly the human's just-played card from its spot in the hand to the play area.
// Ported from game-logic.js playCard() (the floating-card half). `index` is the
// hand slot that was clicked; the hand has not re-rendered yet, so it's still in the DOM.
function flyPlayerCard(playerCard, index, trumpSuit) {
  return new Promise((resolve) => {
    const selectedCard = document.querySelectorAll('.hand .card')[index];
    if (!selectedCard) { resolve(); return; }

    const cardRect = selectedCard.getBoundingClientRect();
    const floatingCard = document.createElement('div');
    floatingCard.className = `card ${playerCard.suit === trumpSuit ? 'trump' : ''}`;
    floatingCard.style.backgroundImage = `url('${cardImg(playerCard)}')`;
    floatingCard.style.position = 'fixed';
    floatingCard.style.top = `${cardRect.top}px`;
    floatingCard.style.left = `${cardRect.left}px`;
    floatingCard.style.zIndex = '100';
    floatingCard.innerHTML = `${playerCard.value} of ${playerCard.suit}`;
    document.body.appendChild(floatingCard);

    const playArea = document.getElementById('play-area');
    const playAreaRect = playArea.getBoundingClientRect();
    const destTop = playAreaRect.top + playAreaRect.height / 2 - cardRect.height / 2;
    const destLeft = playAreaRect.left + playAreaRect.width / 2 - cardRect.width / 2;

    setTimeout(() => {
      floatingCard.style.top = `${destTop}px`;
      floatingCard.style.left = `${destLeft}px`;
      setTimeout(() => {
        document.body.removeChild(floatingCard);
        resolve();
      }, 500);
    }, 10);
  });
}

// Fly the GPT card in when it is RESPONDING to the human's lead (enters from the
// right). Ported from ai-player.js makeGptPlay() respond branch.
function flyGptResponse(gptCard, trumpSuit) {
  return new Promise((resolve) => {
    const cardElement = document.createElement('div');
    cardElement.className = `card ${gptCard.suit === trumpSuit ? 'trump' : ''}`;
    cardElement.style.backgroundImage = `url('${cardImg(gptCard)}')`;
    cardElement.style.position = 'fixed';
    cardElement.style.top = '50px';
    cardElement.style.right = '25%';
    cardElement.style.zIndex = '100';
    cardElement.innerHTML = `${gptCard.value} of ${gptCard.suit}`;
    document.body.appendChild(cardElement);

    const playArea = document.getElementById('play-area');
    const playField = playArea ? playArea.querySelector('.play-field') : null;
    const rect = (playField || playArea).getBoundingClientRect();

    setTimeout(() => {
      cardElement.style.top = `${rect.top + 50}px`;
      cardElement.style.right = `${window.innerWidth - rect.right + 20}px`;
      setTimeout(() => {
        document.body.removeChild(cardElement);
        addGptCardToPlayField(gptCard);
        resolve();
      }, 500);
    }, 10);
  });
}

// Fly the GPT card in when it is LEADING a new trick (enters from the top center).
// Ported from ai-player.js makeGptPlay() lead branch.
function flyGptLead(gptCard, trumpSuit) {
  return new Promise((resolve) => {
    const cardElement = document.createElement('div');
    cardElement.className = `card ${gptCard.suit === trumpSuit ? 'trump' : ''}`;
    cardElement.style.backgroundImage = `url('${cardImg(gptCard)}')`;
    cardElement.style.position = 'fixed';
    cardElement.style.top = '50px';
    cardElement.style.left = '50%';
    cardElement.style.transform = 'translateX(-50%)';
    cardElement.style.zIndex = '100';
    cardElement.innerHTML = `${gptCard.value} of ${gptCard.suit}`;
    document.body.appendChild(cardElement);

    const playArea = document.getElementById('play-area');
    const playAreaRect = playArea.getBoundingClientRect();

    setTimeout(() => {
      cardElement.style.top = `${playAreaRect.top + 50}px`;
      setTimeout(() => {
        document.body.removeChild(cardElement);
        createGptPlayField(gptCard);
        resolve();
      }, 500);
    }, 10);
  });
}

// Animate the two played cards flying to the winner's pile, with the status
// message and points popup. Ported from game-logic.js animateCardsToWinner().
function animateCardsToWinner(winner, trickPoints) {
  return new Promise((resolve) => {
    const playField = document.querySelector('.play-field');
    if (!playField) { resolve(); return; }
    const playedCards = playField.querySelectorAll('.card');
    if (playedCards.length === 0) { resolve(); return; }

    const statusMessage = document.createElement('div');
    statusMessage.className = 'status highlight';
    statusMessage.textContent = winner === 'player'
      ? `You win ${trickPoints} points!`
      : `GPT wins ${trickPoints} points`;
    playField.appendChild(statusMessage);

    const targetPileId = winner === 'player' ? 'player-pile' : 'gpt-pile';
    const targetPile = document.getElementById(targetPileId);
    let targetRect = { top: 0, left: 0 };
    if (targetPile) {
      targetRect = targetPile.getBoundingClientRect();
    } else {
      targetRect = {
        top: winner === 'player' ? window.innerHeight - 100 : -50,
        left: window.innerWidth - 100
      };
    }

    if (trickPoints > 0) {
      showPointsAnimation(
        trickPoints,
        targetRect.left - 20,
        winner === 'player' ? targetRect.top - 60 : targetRect.top + 60
      );
    }

    const animatedCards = Array.from(playedCards).map((card) => {
      const clone = card.cloneNode(true);
      clone.classList.add('animating');
      clone.style.position = 'fixed';
      const rect = card.getBoundingClientRect();
      clone.style.top = `${rect.top}px`;
      clone.style.left = `${rect.left}px`;
      clone.style.zIndex = '200';
      document.body.appendChild(clone);
      return clone;
    });

    setTimeout(() => {
      animatedCards.forEach((card) => {
        const offsetX = Math.random() * 30 - 15;
        const offsetY = Math.random() * 20 - 10;
        card.style.top = `${targetRect.top + offsetY}px`;
        card.style.left = `${targetRect.left + offsetX}px`;
        card.style.transform = 'rotate(' + (Math.random() * 40 - 20) + 'deg) scale(0.8)';
        card.style.opacity = '0.8';
      });
      setTimeout(() => {
        animatedCards.forEach((card) => document.body.removeChild(card));
        resolve();
      }, 800);
    }, 1000);
  });
}

// Drive the full per-trick animation from a server `trickResolved` outcome.
// Resolves when the board has settled (and, if the AI now leads, after its lead
// card has flown in). The caller clears its `busy` flag on resolution.
async function playTrickAnimation(outcome, ctx) {
  const trumpSuit = clientState.trumpCard ? clientState.trumpCard.suit : null;
  const { playerCard, gptCard, winner, trickPoints, humanLed, gptLead, gameOver } = outcome;

  // 1. Player's card flies to the play area.
  await flyPlayerCard(playerCard, ctx.clickedIndex, trumpSuit);

  // 2. Get both cards onto the field. The two chains mirror the original exactly:
  //    when the human led, the GPT response flies in after CARD_ANIMATION_DELAY and
  //    runs concurrently with the resolve delay below (fire-and-forget, as makeGptPlay
  //    did). When the human responded, the GPT card is already on the field.
  if (humanLed) {
    createPlayField(playerCard);
    await delay(CARD_ANIMATION_DELAY);
    flyGptResponse(gptCard, trumpSuit).catch(() => {});
  } else {
    addPlayerCardToPlayField(playerCard);
  }

  // 3. Resolve the trick: cards fly to the winner's pile.
  await delay(CARD_ANIMATION_DELAY);
  await animateCardsToWinner(winner, trickPoints);

  // 4. Settle the board (continueAfterAnimation equivalent).
  if (gameOver) {
    renderGameOver();
    return;
  }
  const playArea = document.getElementById('play-area');
  if (playArea) playArea.innerHTML = '';
  renderGame(); // reads the already-applied settled snapshot from clientState

  // 5. If the AI won, it leads the next trick — fly its lead card in (mirrors the
  //    old renderGame-triggered makeGptPlay lead), then the human can respond.
  if (gptLead) {
    await delay(CARD_ANIMATION_DELAY);
    await flyGptLead(gptLead.card, trumpSuit);
  }
}

export { playTrickAnimation };
