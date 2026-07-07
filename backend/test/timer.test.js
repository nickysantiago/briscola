// Turn-timer and disconnect-handling tests: 60s timeout autoplay, the pause
// while an opponent is away, restart-safe deadlines, and the 24h termination
// sweep. All time flows through an injected fake clock. Run with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMultiplayer } from '../multiplayer.js';
import { actorSeat } from '../game/engine.js';
import { createMemoryStore, fakeSocket, fakeClock, rngQueue } from './helpers/fakes.js';

const TURN_MS = 60_000;
const GRACE_MS = 8_000;
const DAY_MS = 24 * 60 * 60 * 1000;

async function setupGame({ rng } = {}) {
  const store = createMemoryStore();
  const now = fakeClock();
  const mp = createMultiplayer({ store, now, rng });
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
  return { store, now, mp, bind, host, guest, hostToken, guestToken, gameId };
}

test('the turn deadline is armed at game start and published in snapshots', async () => {
  const { store, now, host, gameId } = await setupGame();
  const state = await store.loadState(gameId);
  assert.equal(state.turnDeadline, now() + TURN_MS);
  const snap = host.last('gameState');
  assert.equal(snap.turnDeadline, state.turnDeadline);
  assert.equal(snap.serverNow, now(), 'client can compute clock skew');
});

test('sweep: does nothing before the deadline, auto-plays a random card after it', async () => {
  // rng only drives the timeout pick here (both codes claimed pre-rngQueue... the
  // lobby code uses the first value; subsequent values pick the card index).
  const { store, now, mp, host, guest, gameId } = await setupGame({ rng: rngQueue([0.5, 0.99]) });
  const before = await store.loadState(gameId);

  now.advance(TURN_MS - 1_000);
  await mp.sweepOnce();
  let state = await store.loadState(gameId);
  assert.equal(state.seq, before.seq, '59s in: nothing auto-played');

  now.advance(2_000); // past the deadline
  const expectedCard = before.seats.A.hand[2]; // rng=0.99 over 3 cards -> index 2
  await mp.sweepOnce();
  state = await store.loadState(gameId);
  assert.equal(state.seq, before.seq + 1, 'exactly one half-move applied');
  assert.deepEqual(state.pendingCard, expectedCard, 'the timed-out host led a random card');

  assert.deepEqual(host.last('turnTimeout'), { mine: true, card: expectedCard });
  assert.deepEqual(guest.last('turnTimeout'), { mine: false, card: expectedCard });
  // The auto-play then flows through the normal animation pipeline.
  assert.deepEqual(guest.last('trickLed'), { mine: false, card: expectedCard });
  assert.equal(state.turnDeadline, now() + TURN_MS, 'deadline re-armed for the follower');
  assert.equal(guest.last('gameState').myTurn, true);
});

test('restart safety: the deadline lives in the persisted state, not in memory', async () => {
  const { store, now, gameId, host, guest } = await setupGame();
  // Simulate a backend restart: a brand-new multiplayer instance over the same
  // store knows nothing in memory, but the sweep still honors the deadline.
  const mp2 = createMultiplayer({ store, now, rng: rngQueue([0]) });
  now.advance(TURN_MS + 1);
  await mp2.sweepOnce();
  const state = await store.loadState(gameId);
  assert.equal(state.pendingCard !== null, true, 'timeout enforced by the new process');
  // Neither old socket is bound to the new instance, so no events — but the
  // grace window for reconnection starts fresh rather than instantly flagging.
  assert.equal(state.disconnected.A, null);
  assert.equal(state.disconnected.B, null);
  void host; void guest;
});

test('disconnect: grace period, then flag + pause the turn clock', async () => {
  const { store, now, mp, host, guest, gameId } = await setupGame();
  now.advance(10_000); // 50s left on the clock
  await mp.sweepOnce(); // refreshes lastSeen while connected
  guest.disconnect();

  now.advance(GRACE_MS - 2_000);
  await mp.sweepOnce();
  let state = await store.loadState(gameId);
  assert.equal(state.disconnected.B, null, 'within grace: not flagged');
  assert.equal(host.last('opponentDisconnected'), undefined);

  now.advance(3_000); // past grace
  await mp.sweepOnce();
  state = await store.loadState(gameId);
  assert.ok(state.disconnected.B, 'flagged after grace');
  assert.equal(state.turnDeadline, null, 'turn clock paused');
  assert.equal(state.turnRemainingMs, 41_000, 'remaining time stashed (60s clock, paused 19s in)');
  assert.equal(state.disconnectDeadline, state.disconnected.B + DAY_MS);
  assert.deepEqual(host.last('opponentDisconnected'), { disconnectDeadline: state.disconnectDeadline });
  const snap = host.last('gameState');
  assert.equal(snap.opponentDisconnected, true);
  assert.equal(snap.turnDeadline, null);

  // Flagging happens once; the next sweep stays quiet.
  const notices = host.all('opponentDisconnected').length;
  now.advance(5_000);
  await mp.sweepOnce();
  assert.equal(host.all('opponentDisconnected').length, notices);

  // ...and the paused clock never auto-plays.
  now.advance(TURN_MS * 3);
  await mp.sweepOnce();
  state = await store.loadState(gameId);
  assert.equal(state.pendingCard, null, 'no timeout while paused');
});

test('reconnect: clears the flag and resumes the clock with the stashed time', async () => {
  const { store, now, mp, bind, host, guest, guestToken, gameId } = await setupGame();
  now.advance(10_000);
  await mp.sweepOnce();
  guest.disconnect();
  now.advance(GRACE_MS + 1_000);
  await mp.sweepOnce(); // flags B, stashes remaining

  now.advance(60 * 60 * 1000); // an hour later, Beto returns
  const back = bind();
  await back.send('reconnectMultiplayerGame', { token: guestToken });

  const state = await store.loadState(gameId);
  assert.equal(state.disconnected.B, null);
  assert.equal(state.disconnectDeadline, null);
  assert.equal(state.turnRemainingMs, null);
  assert.equal(state.turnDeadline, now() + 41_000, 'clock resumes from where it paused');

  assert.deepEqual(host.last('opponentReconnected'), {});
  assert.equal(host.last('gameState').opponentDisconnected, false);
  const snap = back.last('gameState');
  assert.deepEqual(snap.playerHand, state.seats.B.hand);
});

test('24h expiry: the sweep terminates and cleans up an abandoned game', async () => {
  const { store, now, mp, host, guest, hostToken, guestToken, gameId } = await setupGame();
  guest.disconnect();
  now.advance(GRACE_MS + 1_000);
  await mp.sweepOnce(); // flag

  now.advance(DAY_MS - 5_000);
  await mp.sweepOnce();
  assert.ok(await store.loadState(gameId), 'still waiting just before the deadline');

  now.advance(10_000);
  await mp.sweepOnce();
  assert.deepEqual(host.last('gameTerminated'), { reason: 'expired' });
  assert.equal(await store.loadState(gameId), null, 'game deleted');
  assert.equal(await store.loadToken(hostToken), null);
  assert.equal(await store.loadToken(guestToken), null);
  assert.deepEqual(await store.listActiveMp(), []);
});

test('race safety: a real move and the timeout sweep cannot both apply', async () => {
  const { store, now, mp, host, gameId } = await setupGame({ rng: rngQueue([0.5, 0]) });
  const before = await store.loadState(gameId);
  now.advance(TURN_MS + 1);

  // Fire both concurrently: the per-game lock serializes them; whichever runs
  // second sees the new seq/deadline and does nothing.
  await Promise.all([
    mp.sweepOnce(),
    host.send('playCard', { gameId, index: 0, seq: before.seq })
  ]);

  const state = await store.loadState(gameId);
  assert.equal(state.seq, before.seq + 1, 'exactly one half-move applied');
  assert.equal(state.seats.A.hand.length, 2, 'exactly one card left the hand');
});
