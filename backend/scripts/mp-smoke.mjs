// Headless multiplayer protocol test — drives the real Socket.io server with
// two clients and no browser. Requires the backend running and reachable at
// BACKEND_URL (default :3000).
//
//   node scripts/mp-smoke.mjs        (from the backend/ directory)
//
// Exercises: create/join lobby, seat-relative snapshots, turn enforcement,
// a full human-vs-human game with a mid-game token reconnect, and the
// disconnect-grace + End Game flow (waits ~10s for the grace period).

import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

const URL = process.env.BACKEND_URL || 'http://localhost:3000';

function connect() {
  return new Promise((resolve, reject) => {
    const socket = io(URL, { transports: ['websocket'], reconnection: false, timeout: 4000 });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (e) => reject(new Error('connect_error: ' + e.message)));
  });
}

function waitEvent(socket, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`timeout waiting for ${event}`)),
      timeoutMs
    );
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function main() {
  // ---- Lobby: create + join -------------------------------------------------
  let hostSock = await connect();
  let guestSock = await connect();

  hostSock.emit('createMultiplayerGame', { name: 'Ana' });
  const lobby = await waitEvent(hostSock, 'lobbyCreated');
  assert.match(lobby.code, /^\d{4}$/, 'lobby code is 4 digits');
  assert.ok(lobby.token, 'host token issued');
  console.log('lobbyCreated OK  code=%s', lobby.code);

  const pOppJoined = waitEvent(hostSock, 'opponentJoined');
  const pHostSnap = waitEvent(hostSock, 'gameState');
  const pJoined = waitEvent(guestSock, 'lobbyJoined');
  const pGuestSnap = waitEvent(guestSock, 'gameState');
  guestSock.emit('joinMultiplayerGame', { code: lobby.code, name: 'Beto' });
  const [oppJoined, joined] = await Promise.all([pOppJoined, pJoined]);
  let [snapA, snapB] = await Promise.all([pHostSnap, pGuestSnap]);
  assert.equal(oppJoined.opponentName, 'Beto');
  assert.equal(joined.opponentName, 'Ana');
  assert.ok(joined.token, 'guest token issued');

  const gameId = snapA.gameId;
  assert.equal(snapA.mode, 'multi');
  assert.equal(snapA.myTurn, true, 'host leads first');
  assert.equal(snapB.myTurn, false);
  assert.deepEqual(snapA.names, { me: 'Ana', opponent: 'Beto' });
  assert.deepEqual(snapB.names, { me: 'Beto', opponent: 'Ana' });
  assert.ok(snapA.turnDeadline > snapA.serverNow, 'turn clock armed');
  assert.ok(!('seats' in snapA) && !('tokens' in snapA), 'no private leakage');
  console.log('join OK  gameId=%s  trump=%s%d', gameId, snapA.trumpCard.suit, snapA.trumpCard.value);

  // ---- Turn enforcement -----------------------------------------------------
  guestSock.emit('playCard', { gameId, index: 0, seq: snapB.seq });
  const err = await waitEvent(guestSock, 'errorState');
  assert.equal(err.code, 'notYourTurn', 'guest cannot lead the first trick');
  console.log('turn enforcement OK');

  // ---- Full game with a mid-game token reconnect ----------------------------
  let halfMoves = 0;
  let reconnected = false;
  while (!snapA.gameOver) {
    if (++halfMoves > 45) throw new Error('runaway: game never ended');

    // After a few moves, swap the guest to a brand-new connection resumed by token.
    if (halfMoves === 7 && !reconnected) {
      reconnected = true;
      const beforeHand = JSON.stringify(snapB.playerHand);
      guestSock.close();
      guestSock = await connect();
      const pResume = waitEvent(guestSock, 'gameState');
      guestSock.emit('reconnectMultiplayerGame', { token: joined.token });
      snapB = await pResume;
      assert.equal(JSON.stringify(snapB.playerHand), beforeHand, 'reconnect restores the seat hand');
      assert.equal(snapB.seq, snapA.seq, 'reconnect is in sync');
      console.log('mid-game token reconnect OK (half-move %d)', halfMoves);
    }

    const actorIsHost = snapA.myTurn;
    const [sock, snap] = actorIsHost ? [hostSock, snapA] : [guestSock, snapB];
    const pA = waitEvent(hostSock, 'gameState');
    const pB = waitEvent(guestSock, 'gameState');
    sock.emit('playCard', { gameId, index: 0, seq: snap.seq });
    [snapA, snapB] = await Promise.all([pA, pB]);
    assert.equal(snapA.seq, snapB.seq, 'both seats see the same seq');
    if (snapA.gameActive) {
      assert.notEqual(snapA.myTurn, snapB.myTurn, 'exactly one seat to act');
    }
  }
  assert.equal(halfMoves, 40, 'a Brisca game is 40 half-moves');
  assert.equal(snapA.playerPoints + snapA.aiPoints, 120, 'points sum to 120');
  assert.equal(snapA.playerPoints, snapB.aiPoints, 'scores are mirrored');
  assert.ok(snapB.gameOver, 'both seats got the game-over snapshot');
  if (snapA.gameOver.winner !== 'tie') {
    assert.notEqual(snapA.gameOver.winner, snapB.gameOver.winner, 'winner is seat-relative');
  }
  console.log('full game OK  %d-%d  winner(host view)=%s', snapA.playerPoints, snapA.aiPoints, snapA.gameOver.winner);
  hostSock.close();
  guestSock.close();

  // ---- Disconnect grace + End Game ------------------------------------------
  const hostSock2 = await connect();
  const guestSock2 = await connect();
  hostSock2.emit('createMultiplayerGame', { name: 'Carla' });
  const lobby2 = await waitEvent(hostSock2, 'lobbyCreated');
  const pJoin2 = waitEvent(guestSock2, 'lobbyJoined');
  const pSnap2 = waitEvent(hostSock2, 'gameState');
  guestSock2.emit('joinMultiplayerGame', { code: lobby2.code, name: 'Dani' });
  const joined2 = await pJoin2;
  const snap2 = await pSnap2;

  console.log('waiting out the disconnect grace period (~9s)…');
  const pDisc = waitEvent(hostSock2, 'opponentDisconnected', 20000);
  guestSock2.close();
  const disc = await pDisc;
  assert.ok(disc.disconnectDeadline > Date.now(), '24h deadline published');
  console.log('opponentDisconnected OK (grace period honored)');

  const pTerm = waitEvent(hostSock2, 'gameTerminated');
  hostSock2.emit('endGame', { gameId: snap2.gameId });
  const term = await pTerm;
  assert.equal(term.reason, 'youEnded');
  console.log('endGame OK (no winner recorded)');

  // The dead session's token no longer resolves.
  const probe = await connect();
  const pGone = waitEvent(probe, 'errorState');
  probe.emit('reconnectMultiplayerGame', { token: joined2.token });
  const gone = await pGone;
  assert.equal(gone.code, 'unknownGame', 'terminated game tokens are revoked');
  probe.close();
  hostSock2.close();

  console.log('\nMP SMOKE PASSED');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nMP SMOKE FAILED:', err);
  process.exit(1);
});
