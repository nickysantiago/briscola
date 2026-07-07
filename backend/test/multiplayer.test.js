// Multiplayer game-flow tests: token reconnection, turn enforcement,
// seat-relative events, and a full human-vs-human game. Run with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMultiplayer } from '../multiplayer.js';
import { actorSeat } from '../game/engine.js';
import { createMemoryStore, fakeSocket, fakeClock, rngQueue } from './helpers/fakes.js';

// Boot a fully-seated game and return everything a test needs.
async function setupGame({ rng, config } = {}) {
  const store = createMemoryStore();
  const now = fakeClock();
  const mp = createMultiplayer({ store, now, rng, config });
  const bind = () => {
    const s = fakeSocket();
    mp.bindConnection(s);
    // server.js owns the shared playCard event and routes multi games here.
    s.on('playCard', (payload) => mp.handlePlayCard(s, payload));
    return s;
  };
  const host = bind();
  await host.send('createMultiplayerGame', { name: 'Ana' });
  const { code, token: hostToken } = host.last('lobbyCreated');
  const guest = bind();
  await guest.send('joinMultiplayerGame', { code, name: 'Beto' });
  const guestToken = guest.last('lobbyJoined').token;
  const gameId = host.last('gameState').gameId;
  return { store, now, mp, bind, host, guest, hostToken, guestToken, gameId, code };
}

test('reconnect: a token resumes the correct seat with its own view', async () => {
  const { store, bind, guestToken, gameId } = await setupGame();
  const fresh = bind();
  await fresh.send('reconnectMultiplayerGame', { token: guestToken });
  const snap = fresh.last('gameState');
  assert.equal(snap.gameId, gameId);
  const state = await store.loadState(gameId);
  assert.deepEqual(snap.playerHand, state.seats.B.hand, 'guest token yields the seat-B hand');
  assert.deepEqual(snap.names, { me: 'Beto', opponent: 'Ana' });
  assert.equal(snap.myTurn, false);
});

test('reconnect: an unknown token is rejected', async () => {
  const { bind } = await setupGame();
  const s = bind();
  await s.send('reconnectMultiplayerGame', { token: 'nope' });
  assert.equal(s.last('errorState').code, 'unknownGame');
  await s.send('reconnectMultiplayerGame', {});
  assert.equal(s.last('errorState').code, 'unknownGame');
});

test('reconnect: a lobby-phase token re-enters the waiting room', async () => {
  const store = createMemoryStore();
  const mp = createMultiplayer({ store, now: fakeClock() });
  const host = fakeSocket();
  mp.bindConnection(host);
  await host.send('createMultiplayerGame', { name: 'Ana' });
  const { code, token } = host.last('lobbyCreated');

  const fresh = fakeSocket();
  mp.bindConnection(fresh);
  await fresh.send('reconnectMultiplayerGame', { token });
  assert.deepEqual(fresh.last('lobbyCreated'), { code, token });
});

test('playCard: enforces seat turn order, seq, and index bounds', async () => {
  const { store, host, guest, gameId } = await setupGame();
  const seq = host.last('gameState').seq;

  await guest.send('playCard', { gameId, index: 0, seq });
  assert.equal(guest.last('errorState').code, 'notYourTurn', 'guest cannot lead the first trick');

  await host.send('playCard', { gameId, index: 0, seq: seq + 5 });
  assert.equal(host.last('errorState').code, 'stale');

  await host.send('playCard', { gameId, index: 9, seq });
  assert.equal(host.last('errorState').code, 'illegal');

  const state = await store.loadState(gameId);
  assert.equal(state.seq, seq, 'no rejected move mutated the game');
});

test('playCard: an unbound socket cannot play a multiplayer game', async () => {
  const { bind, gameId } = await setupGame();
  const stranger = bind(); // connected but never authenticated to a seat
  await stranger.send('playCard', { gameId, index: 0, seq: 0 });
  assert.equal(stranger.last('errorState').code, 'unknownGame');
});

test('a lead is broadcast as trickLed with per-seat "mine" flags and snapshots', async () => {
  const { store, host, guest, gameId } = await setupGame();
  const before = await store.loadState(gameId);
  const ledCard = before.seats.A.hand[1];
  await host.send('playCard', { gameId, index: 1, seq: before.seq });

  assert.deepEqual(host.last('trickLed'), { mine: true, card: ledCard });
  assert.deepEqual(guest.last('trickLed'), { mine: false, card: ledCard });

  const hostSnap = host.last('gameState');
  const guestSnap = guest.last('gameState');
  assert.deepEqual(hostSnap.myPendingCard, ledCard, 'leader sees their card as pending');
  assert.equal(hostSnap.currentAiCard, null);
  assert.deepEqual(guestSnap.currentAiCard, ledCard, 'follower sees the opponent lead');
  assert.equal(hostSnap.myTurn, false);
  assert.equal(guestSnap.myTurn, true);
  assert.equal(hostSnap.seq, before.seq + 1);
});

test('a response resolves the trick with mirrored outcomes for each seat', async () => {
  const { store, host, guest, gameId } = await setupGame();
  let state = await store.loadState(gameId);
  await host.send('playCard', { gameId, index: 0, seq: state.seq });
  state = await store.loadState(gameId);
  await guest.send('playCard', { gameId, index: 0, seq: state.seq });

  const hostOut = host.last('trickResolved');
  const guestOut = guest.last('trickResolved');
  assert.equal(hostOut.humanLed, true, 'the leader sees the trick as theirs');
  assert.equal(guestOut.humanLed, false);
  assert.deepEqual(hostOut.playerCard, guestOut.aiCard);
  assert.deepEqual(hostOut.aiCard, guestOut.playerCard);
  assert.equal(hostOut.trickPoints, guestOut.trickPoints);
  assert.notEqual(hostOut.winner, guestOut.winner, 'winner is seat-relative');
  assert.equal(hostOut.aiLead, null, 'multiplayer never carries a bot lead');

  state = await store.loadState(gameId);
  assert.equal(state.pendingCard, null);
  assert.equal(state.seats.A.points + state.seats.B.points, hostOut.trickPoints);
  const winnerSeat = hostOut.winner === 'player' ? 'A' : 'B';
  assert.equal(state.leader, winnerSeat, 'trick winner leads the next trick');
});

test('a full multiplayer game plays to 120 points and cleans up its lobby', async () => {
  const { store, host, guest, gameId, code } = await setupGame();
  const socketFor = { A: host, B: guest };
  for (let half = 0; half < 40; half++) {
    const state = await store.loadState(gameId);
    if (!state.gameActive) break;
    const seat = actorSeat(state);
    await socketFor[seat].send('playCard', { gameId, index: 0, seq: state.seq });
  }

  const state = await store.loadState(gameId);
  assert.equal(state.gameActive, false, 'game finished');
  assert.equal(state.seats.A.points + state.seats.B.points, 120);
  assert.equal(state.turnDeadline, null, 'clock disarmed at game over');

  const hostSnap = host.last('gameState');
  const guestSnap = guest.last('gameState');
  assert.ok(hostSnap.gameOver && guestSnap.gameOver);
  assert.equal(hostSnap.gameOver.playerPoints, guestSnap.gameOver.aiPoints);
  if (hostSnap.gameOver.winner !== 'tie') {
    assert.notEqual(hostSnap.gameOver.winner, guestSnap.gameOver.winner);
  }

  assert.deepEqual(await store.listActiveMp(), [], 'finished game left the sweep index');
  assert.equal(await store.loadLobby(code), null, 'lobby code freed at game over');
});

test('endGame: refused while the opponent is still connected', async () => {
  const { host, gameId } = await setupGame();
  await host.send('endGame', { gameId });
  assert.equal(host.last('errorState').code, 'cannotEndGame');
});

test('endGame: after a flagged disconnect it terminates with no winner', async () => {
  const { store, now, mp, host, guest, hostToken, guestToken, gameId, code } = await setupGame();
  guest.disconnect();
  now.advance(9_000); // past the 8s grace
  await mp.sweepOnce();
  assert.equal(host.last('opponentDisconnected') !== undefined, true);

  await host.send('endGame', { gameId });
  assert.deepEqual(host.last('gameTerminated'), { reason: 'youEnded' });
  assert.equal(await store.loadState(gameId), null, 'game deleted');
  assert.equal(await store.loadToken(hostToken), null);
  assert.equal(await store.loadToken(guestToken), null);
  assert.equal(await store.loadLobby(code), null);
  assert.deepEqual(await store.listActiveMp(), []);
});
