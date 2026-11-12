// Post-deploy smoke test: is the expected build live, and is it wired end to end
// (edge -> nginx -> backend -> Redis)? Deliberately small and fast; game rules
// are covered by the backend unit tests and the integration suite.
//
//   BASE_URL=https://brisca.nsantiago.me EXPECTED_VERSION=<sha> npm run smoke
//
// Leaves one short solo game behind in Redis per run (expires after 24h).

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { BASE_URL, EXPECTED_VERSION, VERSION_WAIT_SECONDS, get } from '../lib/config.mjs';
import { waitForDeploy } from '../lib/deploy.mjs';
import { connect, waitForUpgrade, newGame, playCard, resume } from '../lib/socket.mjs';

const STEP = { timeout: 20_000 };

describe(`smoke: ${BASE_URL}`, () => {
  // Gate: everything below runs only against the build we mean to test.
  before(
    () => waitForDeploy({ expected: EXPECTED_VERSION, timeoutSeconds: VERSION_WAIT_SECONDS }),
    { timeout: (VERSION_WAIT_SECONDS + 30) * 1000 }
  );

  test('serves the app shell and its JS bundle', STEP, async () => {
    const res = await get('/');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const html = await res.text();
    assert.match(html, /<title>Brisca Card Game<\/title>/);

    // SvelteKit emits relative (./_app/...) or absolute (/_app/...) asset paths.
    const bundle = html.match(/_app\/immutable\/[^"'\s]+\.js/);
    assert.ok(bundle, 'index.html references no _app/immutable/*.js bundle');
    const js = await get('/' + bundle[0]);
    assert.equal(js.status, 200, `GET /${bundle[0]}`);
    assert.match(js.headers.get('content-type'), /javascript/);
  });

  test('serves card images', STEP, async () => {
    const res = await get('/cards/1_of_oros.png');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
  });

  test('backend reports healthy and reaches Redis', STEP, async () => {
    const res = await get('/api/status');
    const body = await res.json();
    assert.equal(res.status, 200, `status body: ${JSON.stringify(body)}`);
    assert.equal(body.status, 'ok');
    assert.equal(body.redis, 'ok');
  });

  test('Socket.io connects through the proxy and upgrades to WebSocket', STEP, async () => {
    const socket = await connect();
    try {
      await waitForUpgrade(socket);
    } finally {
      socket.close();
    }
  });

  describe('solo game round trip', () => {
    let socket;
    let game; // snapshot after newGame
    let played; // snapshot after one trick

    before(async () => {
      socket = await connect();
    });
    after(() => socket?.close());

    test('newGame deals a fresh hand', STEP, async () => {
      game = await newGame(socket, 'easy');
      assert.equal(game.mode, 'solo');
      assert.equal(game.gameActive, true);
      assert.equal(game.myTurn, true);
      assert.equal(game.playerHand.length, 3);
      assert.equal(game.deckCount, 33); // 40 - 6 dealt - 1 turned trump
      assert.ok(game.trumpCard, 'no trump card in snapshot');
      assert.ok(Number.isInteger(game.seq), `seq=${game.seq}`);
    });

    test('playCard resolves a trick', STEP, async () => {
      assert.ok(game, 'needs the game from the newGame step');
      const { outcome, state } = await playCard(socket, { gameId: game.gameId, index: 0, seq: game.seq });
      assert.ok(outcome, 'no trickResolved before gameState');
      assert.equal(state.gameId, game.gameId);
      assert.equal(state.deckCount, 31); // both seats drew
      assert.equal(state.playerHand.length, 3);
      assert.ok(state.seq > game.seq, `seq did not advance (${game.seq} -> ${state.seq})`);
      played = state;
    });

    test('resume on a new connection reloads the game from Redis', STEP, async () => {
      assert.ok(played, 'needs the trick from the playCard step');
      const other = await connect();
      try {
        const resumed = await resume(other, played.gameId);
        assert.equal(resumed.seq, played.seq);
        assert.equal(resumed.deckCount, played.deckCount);
        assert.deepEqual(resumed.playerHand, played.playerHand);
      } finally {
        other.close();
      }
    });
  });
});
