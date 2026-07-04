// server.js - Socket.io game server.
//
// The browser talks to this exclusively over Socket.io (same origin: nginx
// reverse-proxies /socket.io/ to this process, so no CORS config is needed).
// The server is the sole authority on game state: it loads from Redis at the top
// of every action, mutates via the pure engine, and persists the result.
//
// Protocol
//   client -> server:  newGame {difficulty}
//                      playCard {gameId, index, seq}
//                      resume   {gameId}
//   server -> client:  gameState     (public snapshot; render/resume)
//                      trickResolved (timing-free outcome the client animates)
//                      errorState    {code, message}

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Server } from 'socket.io';

import { createGame, applyPlayerMove, toSnapshot } from './game/engine.js';
import { connectStore, loadState, saveState } from './store.js';

const PORT = Number(process.env.PORT) || 3000;

// The human can act whenever it's a valid card index and the game is live. The
// engine guarantees every persisted state is one the human is allowed to act on
// (either they lead, or the AI has already led and currentAiCard is set).
function legalTurn(state, index) {
  return Number.isInteger(index) && index >= 0 && index < state.playerHand.length;
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

io.on('connection', (socket) => {
  socket.on('newGame', async (payload = {}) => {
    try {
      const gameId = randomUUID();
      const state = createGame(payload.difficulty, gameId);
      await saveState(state);
      socket.emit('gameState', toSnapshot(state));
    } catch (err) {
      console.error('[newGame]', err);
      socket.emit('errorState', { code: 'newGameFailed', message: 'Could not start a game.' });
    }
  });

  socket.on('resume', async (payload = {}) => {
    try {
      const state = await loadState(payload.gameId);
      if (!state) {
        socket.emit('errorState', { code: 'unknownGame', message: 'No saved game found.' });
        return;
      }
      socket.emit('gameState', toSnapshot(state));
    } catch (err) {
      console.error('[resume]', err);
      socket.emit('errorState', { code: 'resumeFailed', message: 'Could not resume the game.' });
    }
  });

  socket.on('playCard', async (payload = {}) => {
    const { gameId, index, seq } = payload;
    try {
      const state = await loadState(gameId);
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
      await saveState(state);

      // One outcome to animate, then the settled (idempotent) snapshot.
      socket.emit('trickResolved', outcome);
      socket.emit('gameState', toSnapshot(state));
    } catch (err) {
      console.error('[playCard]', err);
      socket.emit('errorState', { code: 'playFailed', message: 'Could not play that card.' });
    }
  });
});

async function start() {
  await connectStore();
  httpServer.listen(PORT, () => {
    console.log(`[brisca] backend listening on :${PORT}`);
  });
}

start().catch((err) => {
  console.error('[brisca] failed to start:', err);
  process.exit(1);
});
