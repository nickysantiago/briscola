// Socket.io client helpers for driving the game protocol over the network.

import { io } from 'socket.io-client';
import { BASE_URL } from './config.mjs';

const EVENT_TIMEOUT_MS = 10_000;

// Connect with the client defaults (HTTP long-polling, then a WebSocket upgrade),
// the same path a browser takes through Cloudflare and nginx.
export function connect(options = {}) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE_URL, { reconnection: false, timeout: EVENT_TIMEOUT_MS, ...options });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => {
      socket.close();
      reject(new Error(`connect_error: ${err.message}`));
    });
  });
}

// Resolve once the connection is on WebSocket; reject if the upgrade fails.
export function waitForUpgrade(socket, timeoutMs = EVENT_TIMEOUT_MS) {
  const engine = socket.io.engine;
  if (engine.transport.name === 'websocket') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`no WebSocket upgrade within ${timeoutMs}ms (still on ${engine.transport.name})`));
    }, timeoutMs);
    const onUpgrade = () => {
      cleanup();
      resolve();
    };
    const onError = (err) => {
      cleanup();
      reject(new Error(`WebSocket upgrade failed: ${err.message}`));
    };
    function cleanup() {
      clearTimeout(timer);
      engine.off('upgrade', onUpgrade);
      engine.off('upgradeError', onError);
    }
    engine.on('upgrade', onUpgrade);
    engine.on('upgradeError', onError);
  });
}

// Emit `event` and resolve with the next `replyEvent` payload. An errorState
// reply rejects with an Error carrying the server's `.code`.
export function request(socket, event, payload, replyEvent, timeoutMs = EVENT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timeout waiting for ${replyEvent} after ${event}`));
    }, timeoutMs);
    const onReply = (data) => {
      cleanup();
      resolve(data);
    };
    const onError = (err) => {
      cleanup();
      reject(Object.assign(new Error(`${event} failed: ${err.code} (${err.message})`), { code: err.code }));
    };
    function cleanup() {
      clearTimeout(timer);
      socket.off(replyEvent, onReply);
      socket.off('errorState', onError);
    }
    socket.on(replyEvent, onReply);
    socket.on('errorState', onError);
    socket.emit(event, payload);
  });
}

export const newGame = (socket, difficulty) =>
  request(socket, 'newGame', { difficulty }, 'gameState');

export const resume = (socket, gameId) =>
  request(socket, 'resume', { gameId }, 'gameState');

// A solo move replies with trickResolved, then the settled gameState.
export async function playCard(socket, { gameId, index, seq }) {
  let outcome = null;
  const onOutcome = (o) => {
    outcome = o;
  };
  socket.on('trickResolved', onOutcome);
  try {
    const state = await request(socket, 'playCard', { gameId, index, seq }, 'gameState');
    return { outcome, state };
  } finally {
    socket.off('trickResolved', onOutcome);
  }
}
