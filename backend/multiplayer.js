// multiplayer.js - Two-human game sessions: lobby, reconnect tokens, turn
// timer and disconnect handling.
//
// Built as a factory with injected dependencies ({store, now, rng, config}) so
// the whole flow is unit-testable against an in-memory store and a fake clock.
//
// Session model
//   - A 4-digit room code names a lobby (brisca:lobby:{code}). The host waits
//     in it; when a guest joins, the real game state is created and the lobby
//     flips to status 'active' pointing at the gameId.
//   - Each seat gets a reconnect token (brisca:token:{token} -> {gameId, seat}).
//     The client stores it in localStorage and re-authenticates with it on any
//     (re)connect, resuming its seat with no manual re-entry.
//   - All in-memory maps here are just socket plumbing; every fact that must
//     survive a backend restart (turnDeadline, disconnected flags,
//     disconnectDeadline) lives in the persisted state.
//
// Concurrency: every load-mutate-save runs under withLock(gameId). The seq
// turn-token protects against client replays; the lock serializes real moves
// against the sweep's timeout autoplay (which has no seq).

import { randomUUID } from 'node:crypto';
import {
  createMultiplayerGame as engineCreateMultiplayerGame,
  applyMove,
  actorSeat,
  otherSeat,
  outcomeFor,
  toSnapshot,
  STATE_VERSION
} from './game/engine.js';
import { withLock } from './lock.js';

const DEFAULTS = {
  TURN_MS: 60_000,                    // per-turn clock
  GRACE_MS: 8_000,                    // socket-drop grace before flagging a disconnect
  DISCONNECT_MS: 24 * 60 * 60 * 1000, // how long a disconnected player may return
  SWEEP_INTERVAL_MS: 1_000,
  CODE_RETRIES: 20
};

const SEATS = ['A', 'B'];

export function createMultiplayer({ store, now = Date.now, rng = Math.random, config = {} } = {}) {
  const cfg = { ...DEFAULTS, ...config };

  // socket.id -> { kind: 'lobby', code, token } | { kind: 'game', gameId, seat, token }
  const sessions = new Map();
  // gameId -> { A: socket|null, B: socket|null }
  const seatSockets = new Map();
  // code -> host socket waiting in the lobby
  const lobbySockets = new Map();
  // gameId -> { A: epoch ms, B: epoch ms } last time the seat had a live socket.
  // Rebuilt on restart (initialized to "now"), granting a fresh grace window.
  const lastSeen = new Map();

  function sendError(socket, code, message, extra = {}) {
    socket.emit('errorState', { code, message, ...extra });
  }

  function seatSocket(gameId, seat) {
    const seats = seatSockets.get(gameId);
    const sock = seats ? seats[seat] : null;
    return sock && sock.connected ? sock : null;
  }

  function emitToSeat(gameId, seat, event, payload) {
    const sock = seatSocket(gameId, seat);
    if (sock) sock.emit(event, payload);
  }

  function bindLobbySocket(socket, code, token) {
    sessions.set(socket.id, { kind: 'lobby', code, token });
    lobbySockets.set(code, socket);
  }

  // Bind a socket to a seat. Last bind wins: a second tab with the same token
  // silently supersedes the first (the stale tab re-syncs on its next action).
  function bindGameSocket(socket, gameId, seat, token) {
    sessions.set(socket.id, { kind: 'game', gameId, seat, token });
    let seats = seatSockets.get(gameId);
    if (!seats) {
      seats = { A: null, B: null };
      seatSockets.set(gameId, seats);
    }
    const prev = seats[seat];
    if (prev && prev.id !== socket.id) sessions.delete(prev.id);
    seats[seat] = socket;

    let seen = lastSeen.get(gameId);
    if (!seen) {
      seen = { A: now(), B: now() };
      lastSeen.set(gameId, seen);
    }
    seen[seat] = now();
  }

  async function loadGame(gameId) {
    const state = await store.loadState(gameId);
    if (!state || state.stateVersion !== STATE_VERSION || state.mode !== 'multi') return null;
    return state;
  }

  function cleanName(raw) {
    if (typeof raw !== 'string') return null;
    const name = raw.trim().replace(/\s+/g, ' ');
    return name.length >= 1 && name.length <= 16 ? name : null;
  }

  // ------------------------------------------------------------------
  // Timer helpers. turnDeadline is the single source of truth (epoch ms in the
  // persisted state); turnRemainingMs stashes the paused clock while anyone is
  // disconnected so a player can't lose on time while their opponent is away.
  // ------------------------------------------------------------------

  function armTurnTimer(state) {
    if (!state.gameActive) {
      state.turnDeadline = null;
      state.turnRemainingMs = null;
    } else if (!state.disconnected.A && !state.disconnected.B) {
      state.turnDeadline = now() + cfg.TURN_MS;
      state.turnRemainingMs = null;
    } else {
      state.turnDeadline = null;      // paused
      state.turnRemainingMs = cfg.TURN_MS;
    }
  }

  // Clear a seat's disconnect flag and resume/re-anchor timers accordingly.
  // Returns true when the state changed (caller persists).
  function clearDisconnected(state, seat) {
    if (!state.disconnected[seat]) return false;
    state.disconnected[seat] = null;
    const opp = otherSeat(seat);
    if (state.disconnected[opp]) {
      // The other seat is still away; the 24h clock now anchors on them.
      state.disconnectDeadline = state.disconnected[opp] + cfg.DISCONNECT_MS;
    } else {
      state.disconnectDeadline = null;
      if (state.gameActive && state.turnDeadline === null) {
        state.turnDeadline = now() + (state.turnRemainingMs ?? cfg.TURN_MS);
        state.turnRemainingMs = null;
      }
    }
    return true;
  }

  // ------------------------------------------------------------------
  // Shared post-move bookkeeping: re-arm the timer, persist, notify both
  // seats. `res` is the engine MoveResult ('led' or 'resolved').
  // ------------------------------------------------------------------
  async function afterMove(state, res) {
    armTurnTimer(state);
    await store.saveState(state);
    if (!state.gameActive) {
      // Leave the sweep index, but KEEP the lobby: the session still owns its
      // code while the players decide on a rematch. It is deleted on
      // termination, or ages out with its TTL if simply abandoned.
      await store.removeActiveMp(state.gameId);
    }
    const t = now();
    for (const seat of SEATS) {
      if (res.kind === 'led') {
        emitToSeat(state.gameId, seat, 'trickLed', { mine: res.seat === seat, card: res.card });
      } else {
        emitToSeat(state.gameId, seat, 'trickResolved', outcomeFor(res, seat, state));
      }
      emitToSeat(state.gameId, seat, 'gameState', toSnapshot(state, seat, t));
    }
  }

  // Tear the session down completely (End Game or 24h expiry). No winner is
  // recorded; the game, its tokens and its lobby are deleted.
  async function terminateGame(state, reasonBySeat) {
    for (const seat of SEATS) {
      emitToSeat(state.gameId, seat, 'gameTerminated', { reason: reasonBySeat[seat] });
      const sock = seatSockets.get(state.gameId)?.[seat];
      if (sock) sessions.delete(sock.id);
    }
    if (state.tokens) {
      await store.deleteToken(state.tokens.A);
      await store.deleteToken(state.tokens.B);
    }
    await store.deleteGame(state.gameId);
    await store.removeActiveMp(state.gameId);
    if (state.lobbyCode) {
      // Only delete the lobby if it still belongs to this session — its TTL
      // may have lapsed and the code been re-claimed by strangers.
      const lobby = await store.loadLobby(state.lobbyCode);
      if (lobby && lobby.gameId === state.gameId) await store.deleteLobby(state.lobbyCode);
    }
    seatSockets.delete(state.gameId);
    lastSeen.delete(state.gameId);
  }

  // ------------------------------------------------------------------
  // createMultiplayerGame {name} -> lobbyCreated {code, token}
  // ------------------------------------------------------------------
  async function handleCreate(socket, payload = {}) {
    const name = cleanName(payload.name);
    if (!name) {
      return sendError(socket, 'badName', 'Please enter a name (1-16 characters).');
    }
    const token = randomUUID();
    let code = null;
    for (let i = 0; i < cfg.CODE_RETRIES; i++) {
      const candidate = String(Math.floor(rng() * 10000)).padStart(4, '0');
      const record = {
        code: candidate,
        hostName: name,
        hostToken: token,
        guestName: null,
        gameId: null,
        status: 'waiting',
        createdAt: now()
      };
      if (await store.claimLobbyCode(candidate, record)) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      return sendError(socket, 'lobbyCreateFailed', 'Could not create a room. Please try again.');
    }
    await store.saveToken(token, { kind: 'lobby', code });
    bindLobbySocket(socket, code, token);
    socket.emit('lobbyCreated', { code, token });
  }

  // ------------------------------------------------------------------
  // joinMultiplayerGame {code, name} -> guest: lobbyJoined + gameState
  //                                     host:  opponentJoined + gameState
  // ------------------------------------------------------------------
  async function handleJoin(socket, payload = {}) {
    const name = cleanName(payload.name);
    if (!name) {
      return sendError(socket, 'badName', 'Please enter a name (1-16 characters).');
    }
    const code = String(payload.code ?? '').trim();
    if (!/^\d{4}$/.test(code)) {
      return sendError(socket, 'unknownLobby', 'No room with that code.');
    }
    // Serialize concurrent joins on the same code.
    return withLock(`lobby:${code}`, async () => {
      const lobby = await store.loadLobby(code);
      if (!lobby) {
        return sendError(socket, 'unknownLobby', 'No room with that code.');
      }
      if (lobby.status !== 'waiting' || lobby.guestName) {
        return sendError(socket, 'lobbyFull', 'That room already has two players.');
      }

      const gameId = randomUUID();
      const guestToken = randomUUID();
      const state = engineCreateMultiplayerGame({ gameId, hostName: lobby.hostName, guestName: name });
      state.lobbyCode = code;
      state.tokens = { A: lobby.hostToken, B: guestToken };
      state.turnDeadline = now() + cfg.TURN_MS;
      await store.saveState(state);
      await store.saveToken(lobby.hostToken, { kind: 'game', gameId, seat: 'A' });
      await store.saveToken(guestToken, { kind: 'game', gameId, seat: 'B' });
      await store.saveLobby({ ...lobby, status: 'active', guestName: name, gameId });
      await store.addActiveMp(gameId);

      const hostSocket = lobbySockets.get(code) ?? null;
      lobbySockets.delete(code);
      if (hostSocket) bindGameSocket(hostSocket, gameId, 'A', lobby.hostToken);
      bindGameSocket(socket, gameId, 'B', guestToken);

      const t = now();
      if (hostSocket && hostSocket.connected) {
        hostSocket.emit('opponentJoined', { opponentName: name });
        hostSocket.emit('gameState', toSnapshot(state, 'A', t));
      }
      socket.emit('lobbyJoined', { token: guestToken, code, opponentName: lobby.hostName });
      socket.emit('gameState', toSnapshot(state, 'B', t));
    });
  }

  // ------------------------------------------------------------------
  // reconnectMultiplayerGame {token} — resume a seat (or a waiting lobby)
  // after a page load or socket reconnect.
  // ------------------------------------------------------------------
  async function handleReconnect(socket, payload = {}) {
    const token = typeof payload.token === 'string' ? payload.token : null;
    const record = token ? await store.loadToken(token) : null;
    if (!record) {
      return sendError(socket, 'unknownGame', 'No saved game found.');
    }

    if (record.kind === 'lobby') {
      const lobby = await store.loadLobby(record.code);
      if (lobby && lobby.status === 'waiting') {
        bindLobbySocket(socket, record.code, token);
        socket.emit('lobbyCreated', { code: record.code, token });
        return;
      }
      // The guest may have joined while the host was away: the token record is
      // overwritten at join time, but fall back via the lobby just in case the
      // stale pointer is read mid-transition.
      if (lobby && lobby.status === 'active' && lobby.gameId) {
        return resumeSeat(socket, lobby.gameId, 'A', token);
      }
      await store.deleteToken(token);
      return sendError(socket, 'unknownGame', 'That room has expired.');
    }

    return resumeSeat(socket, record.gameId, record.seat, token);
  }

  async function resumeSeat(socket, gameId, seat, token) {
    return withLock(gameId, async () => {
      const state = await loadGame(gameId);
      if (!state) {
        await store.deleteToken(token);
        return sendError(socket, 'unknownGame', 'No saved game found.');
      }
      if (!state.tokens || state.tokens[seat] !== token) {
        return sendError(socket, 'unknownGame', 'No saved game found.');
      }
      bindGameSocket(socket, gameId, seat, token);
      const wasFlagged = clearDisconnected(state, seat);
      if (wasFlagged) await store.saveState(state);

      const t = now();
      socket.emit('gameState', toSnapshot(state, seat, t));
      if (wasFlagged) {
        const opp = otherSeat(seat);
        emitToSeat(gameId, opp, 'opponentReconnected', {});
        emitToSeat(gameId, opp, 'gameState', toSnapshot(state, opp, t));
      }
    });
  }

  // ------------------------------------------------------------------
  // playCard {gameId, index, seq} — either seat; the seat comes from the
  // socket's session binding, never from the payload.
  // ------------------------------------------------------------------
  async function handlePlayCard(socket, payload = {}) {
    const session = sessions.get(socket.id);
    if (!session || session.kind !== 'game') {
      return sendError(socket, 'unknownGame', 'No saved game found.');
    }
    const { gameId, seat } = session;
    return withLock(gameId, async () => {
      const state = await loadGame(gameId);
      if (!state) {
        return sendError(socket, 'unknownGame', 'No saved game found.');
      }
      if (!state.gameActive) {
        return sendError(socket, 'gameOver', 'This game is already over.');
      }
      if (payload.seq !== state.seq) {
        return sendError(socket, 'stale', 'Move was out of sync.', { gameId });
      }
      if (actorSeat(state) !== seat) {
        return sendError(socket, 'notYourTurn', 'It is not your turn.');
      }
      const index = payload.index;
      if (!Number.isInteger(index) || index < 0 || index >= state.seats[seat].hand.length) {
        return sendError(socket, 'illegal', 'That move is not allowed.');
      }
      const res = applyMove(state, seat, index);
      await afterMove(state, res);
    });
  }

  // ------------------------------------------------------------------
  // endGame {gameId} — only offered while the opponent is disconnected (or the
  // game is already over). Abandons the session; no winner recorded.
  // ------------------------------------------------------------------
  async function handleEndGame(socket, payload = {}) {
    const session = sessions.get(socket.id);
    if (!session || session.kind !== 'game') {
      return sendError(socket, 'unknownGame', 'No saved game found.');
    }
    const { gameId, seat } = session;
    return withLock(gameId, async () => {
      const state = await loadGame(gameId);
      if (!state) {
        return sendError(socket, 'unknownGame', 'No saved game found.');
      }
      const opp = otherSeat(seat);
      if (state.gameActive && !state.disconnected[opp]) {
        return sendError(socket, 'cannotEndGame', 'You can only end the game while your opponent is disconnected.');
      }
      await terminateGame(state, { [seat]: 'youEnded', [opp]: 'opponentEnded' });
    });
  }

  // ------------------------------------------------------------------
  // requestRematch {gameId} — post-game "play again" vote. When both seats
  // have voted, the game restarts in place: a fresh deal under the SAME
  // gameId, tokens, names and lobby, so nobody re-enters a code and both
  // clients simply receive the new game's first snapshot.
  // ------------------------------------------------------------------
  async function handleRematch(socket) {
    const session = sessions.get(socket.id);
    if (!session || session.kind !== 'game') {
      return sendError(socket, 'unknownGame', 'No saved game found.');
    }
    const { gameId, seat } = session;
    return withLock(gameId, async () => {
      const state = await loadGame(gameId);
      if (!state) {
        return sendError(socket, 'unknownGame', 'No saved game found.');
      }
      if (state.gameActive) {
        return sendError(socket, 'cannotRematch', 'The game is still in progress.');
      }
      state.rematch = state.rematch ?? { A: false, B: false };
      state.rematch[seat] = true;

      if (state.rematch.A && state.rematch.B) {
        // Both agreed: same seats, fresh deal.
        const fresh = engineCreateMultiplayerGame({
          gameId,
          hostName: state.names.A,
          guestName: state.names.B
        });
        fresh.lobbyCode = state.lobbyCode;
        fresh.tokens = state.tokens;
        fresh.turnDeadline = now() + cfg.TURN_MS;
        await store.saveState(fresh);
        await store.addActiveMp(gameId);
        if (fresh.lobbyCode) {
          // Refresh the lobby record so the code stays held for the new game.
          const lobby = await store.loadLobby(fresh.lobbyCode);
          if (lobby && lobby.gameId === gameId) await store.saveLobby(lobby);
        }
        const t = now();
        for (const s of SEATS) {
          emitToSeat(gameId, s, 'gameState', toSnapshot(fresh, s, t));
        }
        return;
      }

      // First vote: persist and let both panels re-render the pending state.
      await store.saveState(state);
      const t = now();
      for (const s of SEATS) {
        emitToSeat(gameId, s, 'gameState', toSnapshot(state, s, t));
      }
    });
  }

  // ------------------------------------------------------------------
  // Sweep: disconnect grace/flagging, 24h termination, turn-timeout autoplay.
  // Runs every SWEEP_INTERVAL_MS over the active-game index; each game is
  // handled under its lock so it cannot race a concurrent real move.
  // ------------------------------------------------------------------
  async function sweepOnce() {
    const ids = await store.listActiveMp();
    for (const gameId of ids) {
      try {
        await withLock(gameId, () => sweepGame(gameId));
      } catch (err) {
        console.error('[mp] sweep failed for', gameId, err);
      }
    }
  }

  async function sweepGame(gameId) {
    const state = await loadGame(gameId);
    if (!state || !state.gameActive) {
      await store.removeActiveMp(gameId);
      return;
    }
    const t = now();
    let seen = lastSeen.get(gameId);
    if (!seen) {
      // Fresh process (restart): everyone gets a full grace window to re-auth.
      seen = { A: t, B: t };
      lastSeen.set(gameId, seen);
    }

    let changed = false;
    for (const seat of SEATS) {
      if (seatSocket(gameId, seat)) {
        seen[seat] = t;
        // Normally cleared by the reconnect handler; belt and braces.
        if (clearDisconnected(state, seat)) {
          changed = true;
          emitToSeat(gameId, otherSeat(seat), 'opponentReconnected', {});
        }
      } else if (!state.disconnected[seat] && t - seen[seat] > cfg.GRACE_MS) {
        state.disconnected[seat] = t;
        if (state.turnDeadline !== null) {
          // Pause the turn clock so nobody times out while a player is away.
          state.turnRemainingMs = Math.max(0, state.turnDeadline - t);
          state.turnDeadline = null;
        }
        const oppFlaggedAt = state.disconnected[otherSeat(seat)];
        const anchor = oppFlaggedAt ? Math.min(oppFlaggedAt, t) : t;
        state.disconnectDeadline = anchor + cfg.DISCONNECT_MS;
        changed = true;
        const opp = otherSeat(seat);
        emitToSeat(gameId, opp, 'opponentDisconnected', { disconnectDeadline: state.disconnectDeadline });
        emitToSeat(gameId, opp, 'gameState', toSnapshot(state, opp, t));
      }
    }

    if (state.disconnectDeadline !== null && t >= state.disconnectDeadline) {
      await terminateGame(state, { A: 'expired', B: 'expired' });
      return;
    }

    if (state.turnDeadline !== null && t >= state.turnDeadline) {
      // Time's up: play a uniformly random card from the timed-out player's
      // hand exactly as if they had clicked it.
      const seat = actorSeat(state);
      const hand = state.seats[seat].hand;
      const index = Math.floor(rng() * hand.length);
      const card = hand[index];
      const res = applyMove(state, seat, index);
      for (const s of SEATS) {
        emitToSeat(gameId, s, 'turnTimeout', { mine: s === seat, card });
      }
      await afterMove(state, res);
      return;
    }

    if (changed) await store.saveState(state);
  }

  let sweepTimer = null;
  let sweeping = false;

  function startSweep() {
    if (sweepTimer) return;
    sweepTimer = setInterval(async () => {
      if (sweeping) return;
      sweeping = true;
      try {
        await sweepOnce();
      } catch (err) {
        console.error('[mp] sweep error:', err);
      } finally {
        sweeping = false;
      }
    }, cfg.SWEEP_INTERVAL_MS);
    if (typeof sweepTimer.unref === 'function') sweepTimer.unref();
  }

  function stopSweep() {
    if (sweepTimer) {
      clearInterval(sweepTimer);
      sweepTimer = null;
    }
  }

  // ------------------------------------------------------------------
  // Socket wiring
  // ------------------------------------------------------------------

  const guarded = (name, fn) => async (socket, payload) => {
    try {
      await fn(socket, payload);
    } catch (err) {
      console.error(`[mp ${name}]`, err);
      sendError(socket, `${name}Failed`, 'Something went wrong. Please try again.');
    }
  };

  const safeCreate = guarded('createMultiplayerGame', handleCreate);
  const safeJoin = guarded('joinMultiplayerGame', handleJoin);
  const safeReconnect = guarded('reconnectMultiplayerGame', handleReconnect);
  const safeEndGame = guarded('endGame', handleEndGame);
  const safeRematch = guarded('requestRematch', handleRematch);
  const safePlayCard = guarded('playCard', handlePlayCard);

  function bindConnection(socket) {
    socket.on('createMultiplayerGame', (payload) => safeCreate(socket, payload));
    socket.on('joinMultiplayerGame', (payload) => safeJoin(socket, payload));
    socket.on('reconnectMultiplayerGame', (payload) => safeReconnect(socket, payload));
    socket.on('endGame', (payload) => safeEndGame(socket, payload));
    socket.on('requestRematch', (payload) => safeRematch(socket, payload));
    socket.on('disconnect', () => {
      const session = sessions.get(socket.id);
      sessions.delete(socket.id);
      if (!session) return;
      if (session.kind === 'lobby') {
        if (lobbySockets.get(session.code) === socket) lobbySockets.delete(session.code);
      } else {
        const seats = seatSockets.get(session.gameId);
        if (seats && seats[session.seat] === socket) seats[session.seat] = null;
      }
      // The sweep's grace window decides whether this becomes a real
      // "opponent disconnected"; a quick refresh re-binds before it fires.
    });
  }

  return {
    bindConnection,
    handlePlayCard: safePlayCard,
    sweepOnce,
    startSweep,
    stopSweep,
    // exposed for tests
    _internals: { sessions, seatSockets, lobbySockets, lastSeen }
  };
}
