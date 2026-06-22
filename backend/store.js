// store.js - Redis persistence for game state.
//
// One key per game: brisca:game:{gameId}. The value is the full JSON-serialized
// engine `state` (already serialization-safe — playerVoidSuits is an array, no Sets).
// Active games get a 1-day TTL; finished games a 1-hour TTL so a post-game refresh
// can still show the result. AOF + RDB persistence is configured on the redis
// container so this data survives restarts.

import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const ACTIVE_TTL_SECONDS = 60 * 60 * 24; // 1 day
const OVER_TTL_SECONDS = 60 * 60;        // 1 hour

const keyFor = (gameId) => `brisca:game:${gameId}`;

const client = createClient({ url: REDIS_URL });
client.on('error', (err) => console.error('[redis] error:', err.message));

async function connectStore() {
  if (!client.isOpen) await client.connect();
}

async function closeStore() {
  if (client.isOpen) await client.quit();
}

// Read the full state for a game, or null if absent/unknown.
async function loadState(gameId) {
  if (!gameId) return null;
  const raw = await client.get(keyFor(gameId));
  return raw ? JSON.parse(raw) : null;
}

// Persist the full state, with a TTL that depends on whether the game is over.
async function saveState(state) {
  const ttl = state.gameActive ? ACTIVE_TTL_SECONDS : OVER_TTL_SECONDS;
  await client.set(keyFor(state.gameId), JSON.stringify(state), { EX: ttl });
}

export { connectStore, closeStore, loadState, saveState };
