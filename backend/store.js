// store.js - Redis persistence for game state, lobbies and reconnect tokens.
//
// Keys:
//   brisca:game:{gameId}   full JSON-serialized engine `state`
//   brisca:lobby:{code}    multiplayer lobby record (4-digit room code)
//   brisca:token:{token}   per-seat reconnect token -> lobby/game pointer
//   brisca:mp:active       SET of active multiplayer gameIds (timer-sweep index)
//
// Active games get a 1-day TTL; finished games a 1-hour TTL so a post-game
// refresh can still show the result. Waiting lobbies idle out after 1 hour;
// activated lobbies stick around for the life of the game so their code cannot
// be re-claimed while playing. Tokens outlive the longest possible game
// (24h disconnect window) so a reconnect after a long absence still resolves.
// AOF + RDB persistence is configured on the redis container so this data
// survives restarts.

import { createClient } from 'redis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const ACTIVE_TTL_SECONDS = 60 * 60 * 24;      // 1 day
const OVER_TTL_SECONDS = 60 * 60;             // 1 hour
const LOBBY_WAITING_TTL_SECONDS = 60 * 60;    // 1 hour idle expiry for unjoined lobbies
const LOBBY_ACTIVE_TTL_SECONDS = 60 * 60 * 24;
const TOKEN_TTL_SECONDS = 60 * 60 * 48;       // 2 days; outlives the 24h disconnect window

const keyFor = (gameId) => `brisca:game:${gameId}`;
const lobbyKeyFor = (code) => `brisca:lobby:${code}`;
const tokenKeyFor = (token) => `brisca:token:${token}`;
const ACTIVE_MP_KEY = 'brisca:mp:active';

const client = createClient({ url: REDIS_URL });
client.on('error', (err) => console.error('[redis] error:', err.message));

async function connectStore() {
  if (!client.isOpen) await client.connect();
}

async function closeStore() {
  if (client.isOpen) await client.quit();
}

// ------------------------------------------------------------------
// Game state
// ------------------------------------------------------------------

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

async function deleteGame(gameId) {
  if (gameId) await client.del(keyFor(gameId));
}

// ------------------------------------------------------------------
// Lobbies
// ------------------------------------------------------------------

// Atomically claim a room code (SET NX). Returns false when the code is
// already taken by a waiting OR active lobby — the caller retries with a new
// random code, so collisions are handled without an EXISTS race.
async function claimLobbyCode(code, record) {
  const res = await client.set(lobbyKeyFor(code), JSON.stringify(record), {
    NX: true,
    EX: LOBBY_WAITING_TTL_SECONDS
  });
  return res === 'OK';
}

async function loadLobby(code) {
  if (!code) return null;
  const raw = await client.get(lobbyKeyFor(code));
  return raw ? JSON.parse(raw) : null;
}

async function saveLobby(record, ttlSeconds = LOBBY_ACTIVE_TTL_SECONDS) {
  await client.set(lobbyKeyFor(record.code), JSON.stringify(record), { EX: ttlSeconds });
}

async function deleteLobby(code) {
  if (code) await client.del(lobbyKeyFor(code));
}

// ------------------------------------------------------------------
// Reconnect tokens
// ------------------------------------------------------------------

async function saveToken(token, record) {
  await client.set(tokenKeyFor(token), JSON.stringify(record), { EX: TOKEN_TTL_SECONDS });
}

async function loadToken(token) {
  if (!token) return null;
  const raw = await client.get(tokenKeyFor(token));
  return raw ? JSON.parse(raw) : null;
}

async function deleteToken(token) {
  if (token) await client.del(tokenKeyFor(token));
}

// ------------------------------------------------------------------
// Active-multiplayer-game index (drives the timer/disconnect sweep)
// ------------------------------------------------------------------

async function addActiveMp(gameId) {
  await client.sAdd(ACTIVE_MP_KEY, gameId);
}

async function removeActiveMp(gameId) {
  await client.sRem(ACTIVE_MP_KEY, gameId);
}

async function listActiveMp() {
  return client.sMembers(ACTIVE_MP_KEY);
}

export {
  connectStore,
  closeStore,
  loadState,
  saveState,
  deleteGame,
  claimLobbyCode,
  loadLobby,
  saveLobby,
  deleteLobby,
  saveToken,
  loadToken,
  deleteToken,
  addActiveMp,
  removeActiveMp,
  listActiveMp
};
