// Multiplayer lobby integration tests: room codes and reconnect tokens in real
// Redis, and lobby events reaching two separate sockets.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { Client, createLobby, playerName, startMatch } from '../lib/client.mjs';

const T = { timeout: 30_000 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const sameCard = (a, b) => a.suit === b.suit && a.value === b.value;

// Close every client a test opened, pass or fail.
async function withClients(fn) {
  const opened = [];
  const open = async (label) => {
    const client = await Client.open(label);
    opened.push(client);
    return client;
  };
  try {
    return await fn(open, opened);
  } finally {
    for (const client of opened) client.close();
  }
}

describe('lobby', { concurrency: true }, () => {
  test('create + join seats both players, each with their own view', T, async () => {
    const { host, guest, code, hostName, guestName, gameId } = await startMatch();
    try {
      assert.match(code, /^\d{4}$/);
      assert.match(host.token, UUID);
      assert.match(guest.token, UUID);
      assert.notEqual(host.token, guest.token);
      assert.equal(host.received('opponentJoined')[0].opponentName, guestName);
      const joined = guest.received('lobbyJoined')[0];
      assert.equal(joined.opponentName, hostName);
      assert.equal(joined.code, code);

      const a = host.state;
      const b = guest.state;
      for (const s of [a, b]) {
        assert.equal(s.gameId, gameId);
        assert.equal(s.mode, 'multi');
        assert.equal(s.deckCount, 33);
        assert.equal(s.playerHand.length, 3);
        assert.equal(s.aiHandCount, 3);
        assert.ok(Number.isFinite(s.turnDeadline), 'turn clock armed');
      }
      assert.equal(a.seq, b.seq);
      assert.deepEqual(a.trumpCard, b.trumpCard);
      assert.ok(!a.playerHand.some((c) => b.playerHand.some((d) => sameCard(c, d))), 'hands overlap');
      assert.deepEqual(a.names, { me: hostName, opponent: guestName });
      assert.deepEqual(b.names, { me: guestName, opponent: hostName });
      assert.equal(a.myTurn, true, 'host leads the first trick');
      assert.equal(b.myTurn, false);
    } finally {
      host.close();
      guest.close();
    }
  });

  test('create and join reject bad names; join rejects malformed codes', T, () =>
    withClients(async (open) => {
      const c = await open('validator');
      for (const name of [undefined, '', '   ', 'x'.repeat(17), 123]) {
        const label = `name ${JSON.stringify(name)}`;
        assert.equal((await c.expectError('createMultiplayerGame', { name })).code, 'badName', label);
        assert.equal((await c.expectError('joinMultiplayerGame', { code: '1234', name })).code, 'badName', label);
      }
      for (const code of ['abcd', '123', '12345', '', ' 1 2 ', null]) {
        const err = await c.expectError('joinMultiplayerGame', { code, name: playerName('x') });
        assert.equal(err.code, 'unknownLobby', `code ${JSON.stringify(code)}`);
      }
    }));

  test('a full lobby rejects a third player', T, async () => {
    const { host, guest, code } = await startMatch();
    try {
      await withClients(async (open) => {
        const third = await open('third');
        const err = await third.expectError('joinMultiplayerGame', { code, name: playerName('third') });
        assert.equal(err.code, 'lobbyFull');
      });
    } finally {
      host.close();
      guest.close();
    }
  });

  test('a host who drops while waiting rejoins the lobby by token and still gets the guest', T, () =>
    withClients(async (open) => {
      const host = await open('host');
      const { code, token } = await createLobby(host);
      host.close();

      const back = await open('host-again');
      const lobby = await back.request('reconnectMultiplayerGame', { token }, 'lobbyCreated');
      assert.deepEqual(lobby, { code, token });

      const guest = await open('guest');
      const since = back.mark();
      await guest.request('joinMultiplayerGame', { code, name: playerName('guest') }, 'gameState');
      await back.next('opponentJoined', { since });
      const snap = await back.next('gameState', { since });
      assert.equal(snap.gameId, guest.state.gameId);
      assert.equal(snap.myTurn, true);
    }));

  test('a guest who joins while the host is away: the host token resumes into the game', T, () =>
    withClients(async (open) => {
      const host = await open('host');
      const { code, token } = await createLobby(host);
      host.close();

      const guest = await open('guest');
      await guest.request('joinMultiplayerGame', { code, name: playerName('guest') }, 'gameState');

      const back = await open('host-again');
      const snap = await back.request('reconnectMultiplayerGame', { token }, 'gameState');
      assert.equal(snap.gameId, guest.state.gameId);
      assert.equal(snap.myTurn, true);
      assert.equal(snap.playerHand.length, 3);
    }));
});
