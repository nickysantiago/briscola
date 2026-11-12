// Security-boundary integration tests: who may act on a game, what a client
// may see, and whether hostile payloads can hurt the server.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import { get } from '../lib/config.mjs';
import { Client, playHalfMove, playToEnd, startMatch } from '../lib/client.mjs';

const T = { timeout: 60_000 };

// The complete public snapshot (backend/game/engine.js toSnapshot). A new field
// fails this test on purpose: review it for leaks, then add it here.
const SNAPSHOT_KEYS = [
  'aiHandCount', 'aiPoints', 'aiWonCards', 'currentAiCard', 'deckCount', 'difficulty',
  'disconnectDeadline', 'gameActive', 'gameId', 'gameOver', 'mode', 'myPendingCard', 'myTurn',
  'names', 'opponentDisconnected', 'playerHand', 'playerLeads', 'playerPoints', 'playerWonCards',
  'rematch', 'seq', 'serverNow', 'trumpCard', 'turnDeadline'
];

const OUTCOME_KEYS = ['aiCard', 'aiLead', 'draws', 'gameOver', 'humanLed', 'playerCard', 'trickPoints', 'winner'];
const DRAW_KEYS = ['aiDrew', 'player', 'trumpPickedUp'];

const sortedKeys = (o) => Object.keys(o).sort();

// Every {suit, value} card object anywhere inside `value`.
function cardsIn(value, found = []) {
  if (Array.isArray(value)) value.forEach((v) => cardsIn(v, found));
  else if (value && typeof value === 'object') {
    if ('suit' in value && 'value' in value) found.push(value);
    else Object.values(value).forEach((v) => cardsIn(v, found));
  }
  return found;
}

const hasCard = (cards, c) => cards.some((d) => d.suit === c.suit && d.value === c.value);

describe('guards', { concurrency: true }, () => {
  test('a socket outside a match cannot act on it', T, async () => {
    const { host, guest, gameId } = await startMatch();
    const intruder = await Client.open('intruder');
    try {
      const seq = host.state.seq;
      const attempts = [
        ['playCard', { gameId, index: 0, seq }],
        ['resume', { gameId }], // solo resume must not reveal a multiplayer hand
        ['endGame', { gameId }],
        ['requestRematch', { gameId }],
        ['reconnectMultiplayerGame', { token: randomUUID() }],
        ['reconnectMultiplayerGame', { token: gameId }]
      ];
      for (const [event, payload] of attempts) {
        const err = await intruder.expectError(event, payload);
        assert.equal(err.code, 'unknownGame', `${event} ${JSON.stringify(payload)}`);
      }
      assert.deepEqual(intruder.received('gameState'), [], 'intruder received a snapshot');

      // The real players are unaffected.
      assert.equal(host.state.seq, seq);
      await playHalfMove(host, guest);
    } finally {
      intruder.close();
      host.close();
      guest.close();
    }
  });

  test('snapshots carry only public fields and never the opponent\'s hand', T, async () => {
    const { host, guest } = await startMatch();
    try {
      const check = (a, b) => {
        for (const [me, them] of [[a, b], [b, a]]) {
          assert.deepEqual(sortedKeys(me), SNAPSHOT_KEYS);
          assert.equal(typeof me.aiHandCount, 'number');
          // The face-up trump is public even after the opponent picks it up.
          const visible = cardsIn({ ...me, trumpCard: null });
          const leaked = them.playerHand.filter((c) => hasCard(visible, c));
          assert.deepEqual(leaked, [], `seq ${me.seq}: opponent's hand visible`);
        }
      };
      check(host.state, guest.state);
      await playToEnd(host, guest, check);

      for (const outcome of [...host.received('trickResolved'), ...guest.received('trickResolved')]) {
        assert.deepEqual(sortedKeys(outcome), OUTCOME_KEYS);
        assert.deepEqual(sortedKeys(outcome.draws), DRAW_KEYS);
        assert.equal(typeof outcome.draws.aiDrew, 'boolean', 'opponent draw must be a flag, not a card');
      }
    } finally {
      host.close();
      guest.close();
    }
  });

  test('malformed payloads get an error reply and never take the server down', T, async () => {
    const before = await (await get('/api/status')).json();
    const events = [
      'newGame', 'resume', 'playCard', 'createMultiplayerGame', 'joinMultiplayerGame',
      'reconnectMultiplayerGame', 'endGame', 'requestRematch'
    ];
    const payloads = [
      null, 42, 'junk', true, [], [1, 2],
      { gameId: { nested: true }, index: '0', seq: '1', code: {}, token: 42 },
      { gameId: 'x'.repeat(10_000), name: 'x'.repeat(10_000), code: '1'.repeat(10_000), token: 'x'.repeat(10_000) }
    ];

    const c = await Client.open('fuzzer');
    try {
      for (const event of events) {
        for (const payload of payloads) {
          const label = `${event}(${JSON.stringify(payload).slice(0, 40)})`;
          const since = c.mark();
          c.socket.emit(event, payload);
          // newGame tolerates junk by falling back to a normal game; all else errors.
          await c.nextOf(['errorState', 'gameState'], { since }).catch((err) => {
            throw new Error(`${label}: ${err.message}`);
          });
          assert.ok(c.socket.connected, `${label}: socket dropped`);
        }
      }
    } finally {
      c.close();
    }

    // Same process still serving (a crash + restart would reset uptime).
    const after = await (await get('/api/status')).json();
    assert.equal(after.status, 'ok');
    assert.ok(after.uptimeSeconds >= before.uptimeSeconds, 'backend restarted during the test');
    const probe = await Client.open('probe');
    try {
      const snap = await probe.request('newGame', { difficulty: 'easy' }, 'gameState');
      assert.equal(snap.deckCount, 33);
    } finally {
      probe.close();
    }
  });
});
