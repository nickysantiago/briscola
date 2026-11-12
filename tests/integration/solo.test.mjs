// Solo-mode integration tests: the real server.js handlers, engine, AI and
// Redis, driven over Socket.io through the deployed proxy. Game rules
// themselves are unit-tested in backend/test; these check the wiring.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { connect, newGame, resume, playCard } from '../lib/socket.mjs';

const T = { timeout: 60_000 };

// Each test owns its sockets so the tests can run concurrently.
async function withSocket(fn) {
  const socket = await connect();
  try {
    return await fn(socket);
  } finally {
    socket.close();
  }
}

// serverNow is the send time, so it differs between otherwise identical snapshots.
const settled = ({ serverNow, ...rest }) => rest;

async function playTricks(socket, snap, count) {
  for (let i = 0; i < count; i++) {
    ({ state: snap } = await playCard(socket, { gameId: snap.gameId, index: 0, seq: snap.seq }));
  }
  return snap;
}

describe('solo', { concurrency: true }, () => {
  test('newGame honours each difficulty and defaults unknown ones to normal', T, () =>
    withSocket(async (s) => {
      for (const difficulty of ['easy', 'normal', 'hard']) {
        const snap = await newGame(s, difficulty);
        assert.equal(snap.mode, 'solo');
        assert.equal(snap.difficulty, difficulty);
      }
      assert.equal((await newGame(s, 'impossible')).difficulty, 'normal');
    }));

  test('a full hard game plays to completion with consistent invariants', T, (t) =>
    withSocket(async (s) => {
      let snap = await newGame(s, 'hard');
      let tricks = 0;
      let slowestMs = 0;

      while (snap.gameActive) {
        const prev = snap;
        const started = Date.now();
        const { outcome, state } = await playCard(s, { gameId: prev.gameId, index: 0, seq: prev.seq });
        slowestMs = Math.max(slowestMs, Date.now() - started);
        tricks++;
        assert.ok(tricks <= 20, 'more than 20 tricks in a 40-card game');

        assert.ok(outcome, `trick ${tricks}: no trickResolved`);
        assert.ok(state.seq > prev.seq, `trick ${tricks}: seq did not advance`);
        assert.equal(state.deckCount, Math.max(0, 33 - 2 * tricks), `trick ${tricks}: deck`);
        assert.equal(state.playerHand.length, Math.min(3, 20 - tricks), `trick ${tricks}: hand`);
        assert.equal(
          state.playerPoints + state.aiPoints,
          prev.playerPoints + prev.aiPoints + outcome.trickPoints,
          `trick ${tricks}: points`
        );
        snap = state;
      }

      assert.equal(tricks, 20);
      assert.equal(snap.playerPoints + snap.aiPoints, 120);
      const expected =
        snap.playerPoints > snap.aiPoints ? 'player' : snap.playerPoints < snap.aiPoints ? 'ai' : 'tie';
      assert.equal(snap.gameOver.winner, expected);
      assert.equal(snap.gameOver.playerPoints, snap.playerPoints);
      assert.equal(snap.gameOver.aiPoints, snap.aiPoints);
      t.diagnostic(`slowest hard-mode trick round trip: ${slowestMs}ms`);
    }));

  test('resume on a new connection returns an identical snapshot', T, () =>
    withSocket(async (s) => {
      const played = await playTricks(s, await newGame(s, 'normal'), 2);
      await withSocket(async (other) => {
        assert.deepEqual(settled(await resume(other, played.gameId)), settled(played));
      });
    }));

  test('a stale seq is rejected and changes nothing', T, () =>
    withSocket(async (s) => {
      const start = await newGame(s, 'easy');
      const played = await playTricks(s, start, 1);
      await assert.rejects(playCard(s, { gameId: start.gameId, index: 0, seq: start.seq }), { code: 'stale' });
      assert.deepEqual(settled(await resume(s, start.gameId)), settled(played));
    }));

  test('bad card indexes are rejected as illegal and change nothing', T, () =>
    withSocket(async (s) => {
      const start = await newGame(s, 'easy');
      for (const index of [3, -1, 1.5, '0', null]) {
        await assert.rejects(
          playCard(s, { gameId: start.gameId, index, seq: start.seq }),
          { code: 'illegal' },
          `index ${JSON.stringify(index)}`
        );
      }
      assert.deepEqual(settled(await resume(s, start.gameId)), settled(start));
    }));

  test('moves after game over are rejected', T, () =>
    withSocket(async (s) => {
      const over = await playTricks(s, await newGame(s, 'easy'), 20);
      assert.equal(over.gameActive, false);
      await assert.rejects(playCard(s, { gameId: over.gameId, index: 0, seq: over.seq }), { code: 'gameOver' });
    }));

  test('two connections sending the same move at once: exactly one applies', T, () =>
    withSocket(async (a) =>
      withSocket(async (b) => {
        const start = await newGame(a, 'normal');
        const move = { gameId: start.gameId, index: 0, seq: start.seq };
        const results = await Promise.allSettled([playCard(a, move), playCard(b, move)]);

        const applied = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');
        assert.equal(applied.length, 1, 'expected exactly one move to apply');
        assert.equal(rejected[0].reason.code, 'stale');
        assert.equal((await resume(a, start.gameId)).seq, applied[0].value.state.seq);
      })
    ));

  test('unknown game ids are rejected', T, () =>
    withSocket(async (s) => {
      await assert.rejects(resume(s, randomUUID()), { code: 'unknownGame' });
      await assert.rejects(resume(s, undefined), { code: 'unknownGame' });
      await assert.rejects(playCard(s, { gameId: randomUUID(), index: 0, seq: 0 }), { code: 'unknownGame' });
    }));
});
