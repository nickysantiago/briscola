// client-state.js - Client-side mirror of the server's public game snapshot.
//
// ui-renderer.js and the animation engine read from this object instead of the
// former game-state.js. It is replaced wholesale by each `gameState` message and
// holds only public info (the player's own hand, counts for the hidden deck/GPT
// hand, the trump, scores, whose turn it is, the last trick, and game-over data).
// The gameId is persisted to localStorage so a refresh/close can resume the game.

const GAME_ID_KEY = 'brisca:gameId';

const clientState = {};

// Merge a server snapshot in. Snapshots always carry the full field set, so each
// field is overwritten every time (no stale leftovers).
function applySnapshot(snapshot) {
  Object.assign(clientState, snapshot);
  if (snapshot && snapshot.gameId) {
    try { localStorage.setItem(GAME_ID_KEY, snapshot.gameId); } catch (e) { /* private mode */ }
  }
}

function getStoredGameId() {
  try { return localStorage.getItem(GAME_ID_KEY); } catch (e) { return null; }
}

function clearStoredGameId() {
  try { localStorage.removeItem(GAME_ID_KEY); } catch (e) { /* ignore */ }
}

export { clientState, applySnapshot, getStoredGameId, clearStoredGameId };
