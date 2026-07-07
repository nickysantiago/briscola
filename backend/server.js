// server.js - Socket.io game server.
//
// The browser talks to this exclusively over Socket.io (same origin: nginx
// reverse-proxies /socket.io/ to this process, so no CORS config is needed).
// The server is the sole authority on game state: it loads from Redis at the top
// of every action, mutates via the pure engine, and persists the result.
//
// Protocol
//   client -> server:  newGame {difficulty}
//                      playCard {gameId, index, seq}   (solo or multiplayer seat)
//                      resume   {gameId}                (solo)
//                      createMultiplayerGame {name}
//                      joinMultiplayerGame   {code, name}
//                      reconnectMultiplayerGame {token}
//                      endGame  {gameId}
//   server -> client:  gameState     (seat-relative snapshot; render/resume)
//                      trickResolved (timing-free outcome the client animates)
//                      trickLed      (multiplayer half-move: a lead hit the table)
//                      lobbyCreated / lobbyJoined / opponentJoined
//                      opponentDisconnected / opponentReconnected
//                      turnTimeout   (a seat ran out the 60s clock; card auto-played)
//                      gameTerminated {reason}
//                      errorState    {code, message}

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';

import { createGame, applyPlayerMove, toSnapshot, STATE_VERSION } from './game/engine.js';
import * as store from './store.js';
import { withLock } from './lock.js';
import { createMultiplayer } from './multiplayer.js';

const PORT = Number(process.env.PORT) || 3000;

// Load a state in the current format. Pre-two-seat states (from before the
// multiplayer release) are treated as unknown so clients fall back cleanly.
async function loadCurrentState(gameId) {
  const state = await store.loadState(gameId);
  return state && state.stateVersion === STATE_VERSION ? state : null;
}

// The human can act whenever it's a valid card index and the game is live. The
// engine guarantees every persisted solo state is one the human is allowed to
// act on (either they lead, or the bot has already led the pending card).
function legalTurn(state, index) {
  return Number.isInteger(index) && index >= 0 && index < state.seats.A.hand.length;
}

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  // Same-origin via the nginx proxy; no CORS needed.
  serveClient: true // expose /socket.io/socket.io.js so the frontend loads a matching client
});

const mp = createMultiplayer({ store });

io.on('connection', (socket) => {
  mp.bindConnection(socket);

  socket.on('newGame', async (payload = {}) => {
    try {
      const gameId = randomUUID();
      const state = createGame(payload.difficulty, gameId);
      await store.saveState(state);
      socket.emit('gameState', toSnapshot(state, 'A'));
    } catch (err) {
      console.error('[newGame]', err);
      socket.emit('errorState', { code: 'newGameFailed', message: 'Could not start a game.' });
    }
  });

  socket.on('resume', async (payload = {}) => {
    try {
      const state = await loadCurrentState(payload.gameId);
      if (!state || state.mode !== 'solo') {
        socket.emit('errorState', { code: 'unknownGame', message: 'No saved game found.' });
        return;
      }
      socket.emit('gameState', toSnapshot(state, 'A'));
    } catch (err) {
      console.error('[resume]', err);
      socket.emit('errorState', { code: 'resumeFailed', message: 'Could not resume the game.' });
    }
  });

  socket.on('playCard', async (payload = {}) => {
    const { gameId, index, seq } = payload;
    try {
      const routed = await loadCurrentState(gameId);
      if (routed && routed.mode === 'multi') {
        // Multiplayer moves are validated against the socket's seat session
        // and serialized under the game lock inside the multiplayer module.
        await mp.handlePlayCard(socket, payload);
        return;
      }

      await withLock(gameId, async () => {
        const state = await loadCurrentState(gameId);
        if (!state) {
          socket.emit('errorState', { code: 'unknownGame', message: 'No saved game found.' });
          return;
        }
        if (!state.gameActive) {
          socket.emit('errorState', { code: 'gameOver', message: 'This game is already over.' });
          return;
        }
        // Turn token: a stale seq means a double-emit or a reconnect replay. Reject
        // and let the client re-sync via resume.
        if (seq !== state.seq) {
          socket.emit('errorState', { code: 'stale', message: 'Move was out of sync.', gameId });
          return;
        }
        if (!legalTurn(state, index)) {
          socket.emit('errorState', { code: 'illegal', message: 'That move is not allowed.' });
          return;
        }

        const outcome = applyPlayerMove(state, index);
        await store.saveState(state);

        // One outcome to animate, then the settled (idempotent) snapshot.
        socket.emit('trickResolved', outcome);
        socket.emit('gameState', toSnapshot(state, 'A'));
      });
    } catch (err) {
      console.error('[playCard]', err);
      socket.emit('errorState', { code: 'playFailed', message: 'Could not play that card.' });
    }
  });
});

async function start() {
  await store.connectStore();
  mp.startSweep();
  httpServer.listen(PORT, () => {
    console.log(`[brisca] backend listening on :${PORT}`);
  });
}

start().catch((err) => {
  console.error('[brisca] failed to start:', err);
  process.exit(1);
});
