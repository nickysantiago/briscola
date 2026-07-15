// Lobby lifecycle tests: room-code generation and collision retry, name
// validation, joining, and the waiting-lobby TTL. Run with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMultiplayer } from '../multiplayer.js';
import { createMemoryStore, fakeSocket, fakeClock, rngQueue } from './helpers/fakes.js';

function setup({ rng, config } = {}) {
  const store = createMemoryStore();
  const now = fakeClock();
  const mp = createMultiplayer({ store, now, rng, config });
  const bind = () => {
    const s = fakeSocket();
    mp.bindConnection(s);
    return s;
  };
  return { store, now, mp, bind };
}

test('create: issues a zero-padded 4-digit code and a token', async () => {
  const { store, bind } = setup({ rng: rngQueue([0.0007]) });
  const host = bind();
  await host.send('createMultiplayerGame', { name: 'Ana' });

  const created = host.last('lobbyCreated');
  assert.ok(created, 'lobbyCreated emitted');
  assert.equal(created.code, '0007');
  assert.match(created.code, /^\d{4}$/);
  assert.ok(created.token.length > 10);

  const lobby = await store.loadLobby('0007');
  assert.equal(lobby.hostName, 'Ana');
  assert.equal(lobby.status, 'waiting');
  assert.equal(lobby.guestName, null);
  assert.equal(lobby.hostToken, created.token);

  const tokenRec = await store.loadToken(created.token);
  assert.deepEqual(tokenRec, { kind: 'lobby', code: '0007' });

  // Unjoined lobbies idle out after an hour.
  assert.equal(store.ttlOf('lobby:0007'), 3600);
});

test('create: retries on a code collision until a free code is found', async () => {
  const { store, bind } = setup({ rng: rngQueue([0.0001, 0.0001, 0.0001, 0.0002]) });
  const first = bind();
  await first.send('createMultiplayerGame', { name: 'Ana' });
  assert.equal(first.last('lobbyCreated').code, '0001');

  const second = bind();
  await second.send('createMultiplayerGame', { name: 'Beto' });
  assert.equal(second.last('lobbyCreated').code, '0002', 'collision with 0001 retried');
  assert.ok(store.lobbies.has('0001') && store.lobbies.has('0002'));
});

test('create: gives up after exhausting retries on permanent collision', async () => {
  const { bind } = setup({ rng: rngQueue([0.0001]) }); // rng stays at 0.0001 forever
  const first = bind();
  await first.send('createMultiplayerGame', { name: 'Ana' });
  const second = bind();
  await second.send('createMultiplayerGame', { name: 'Beto' });
  assert.equal(second.last('errorState').code, 'lobbyCreateFailed');
  assert.equal(second.last('lobbyCreated'), undefined);
});

test('create/join: rejects missing or oversized names', async () => {
  const { bind } = setup();
  const s = bind();
  await s.send('createMultiplayerGame', {});
  assert.equal(s.last('errorState').code, 'badName');
  await s.send('createMultiplayerGame', { name: '   ' });
  assert.equal(s.last('errorState').code, 'badName');
  await s.send('createMultiplayerGame', { name: 'x'.repeat(17) });
  assert.equal(s.last('errorState').code, 'badName');
  await s.send('joinMultiplayerGame', { code: '1234', name: '' });
  assert.equal(s.last('errorState').code, 'badName');
});

test('join: creates the game, seats both players, arms the turn timer', async () => {
  const { store, now, bind } = setup({ rng: rngQueue([0.1234]) });
  const host = bind();
  await host.send('createMultiplayerGame', { name: 'Ana' });
  const { code, token: hostToken } = host.last('lobbyCreated');

  const guest = bind();
  await guest.send('joinMultiplayerGame', { code, name: 'Beto' });

  // Guest gets its token + a seat-B view.
  const joined = guest.last('lobbyJoined');
  assert.equal(joined.opponentName, 'Ana');
  assert.equal(joined.code, code);
  const guestSnap = guest.last('gameState');
  assert.equal(guestSnap.mode, 'multi');
  assert.equal(guestSnap.playerLeads, false, 'host (seat A) leads first');
  assert.equal(guestSnap.myTurn, false);
  assert.deepEqual(guestSnap.names, { me: 'Beto', opponent: 'Ana' });

  // Host is told and gets a seat-A view.
  assert.deepEqual(host.last('opponentJoined'), { opponentName: 'Beto' });
  const hostSnap = host.last('gameState');
  assert.equal(hostSnap.myTurn, true);
  assert.deepEqual(hostSnap.names, { me: 'Ana', opponent: 'Beto' });
  assert.equal(hostSnap.gameId, guestSnap.gameId);

  // Persisted plumbing: tokens point at seats, lobby is active, sweep index set.
  const state = await store.loadState(hostSnap.gameId);
  assert.equal(state.turnDeadline, now() + 60_000);
  assert.deepEqual(await store.loadToken(hostToken), { kind: 'game', gameId: state.gameId, seat: 'A' });
  assert.deepEqual(await store.loadToken(joined.token), { kind: 'game', gameId: state.gameId, seat: 'B' });
  const lobby = await store.loadLobby(code);
  assert.equal(lobby.status, 'active');
  assert.equal(lobby.gameId, state.gameId);
  assert.equal(lobby.guestName, 'Beto');
  assert.equal(store.ttlOf(`lobby:${code}`), 86400, 'active lobby holds its code for the game');
  assert.deepEqual(await store.listActiveMp(), [state.gameId]);

  // Snapshots never leak the opponent hand or tokens.
  for (const snap of [hostSnap, guestSnap]) {
    assert.ok(!('seats' in snap) && !('deck' in snap) && !('tokens' in snap));
    assert.ok(!JSON.stringify(snap).includes(hostToken));
  }
});

test('join: unknown or malformed codes are rejected', async () => {
  const { bind } = setup();
  const s = bind();
  await s.send('joinMultiplayerGame', { code: '9999', name: 'Beto' });
  assert.equal(s.last('errorState').code, 'unknownLobby');
  await s.send('joinMultiplayerGame', { code: 'abcd', name: 'Beto' });
  assert.equal(s.last('errorState').code, 'unknownLobby');
});

test('join: a full lobby rejects a third player', async () => {
  const { bind } = setup();
  const host = bind();
  await host.send('createMultiplayerGame', { name: 'Ana' });
  const { code } = host.last('lobbyCreated');
  const guest = bind();
  await guest.send('joinMultiplayerGame', { code, name: 'Beto' });
  const third = bind();
  await third.send('joinMultiplayerGame', { code, name: 'Carla' });
  assert.equal(third.last('errorState').code, 'lobbyFull');
  assert.equal(third.last('gameState'), undefined);
});
