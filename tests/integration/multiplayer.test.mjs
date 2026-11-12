// Multiplayer gameplay integration tests: two real sockets, real Redis, and the
// server's real-time sweep (disconnect grace and turn clock).

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

import { Client, playHalfMove, playToEnd, startMatch } from '../lib/client.mjs';

// Mirrors backend/multiplayer.js: a dropped seat is flagged once GRACE_MS has
// passed since the sweep (every SWEEP_MS) last saw it connected.
const GRACE_MS = 8_000;
const SWEEP_MS = 1_000;
const FLAG_WITHIN_MS = GRACE_MS + 2 * SWEEP_MS + 4_000; // + network slack

const T = { timeout: 60_000 };

// Run `fn` with a fresh match, closing every socket afterwards.
async function withMatch(fn) {
  const match = await startMatch();
  const extra = [];
  const reopen = async (label, token) => {
    const client = await Client.open(label);
    extra.push(client);
    await client.request('reconnectMultiplayerGame', { token }, 'gameState');
    client.token = token;
    return client;
  };
  try {
    return await fn({ ...match, reopen });
  } finally {
    for (const client of [match.host, match.guest, ...extra]) client.close();
  }
}

describe('multiplayer', { concurrency: true }, () => {
  test('turn order is enforced and both seats see each half-move from their side', T, () =>
    withMatch(async ({ host, guest, gameId }) => {
      const early = await guest.expectError('playCard', { gameId, index: 0, seq: guest.state.seq });
      assert.equal(early.code, 'notYourTurn');

      // Host leads.
      const led = host.state.playerHand[0];
      let marks = [host.mark(), guest.mark()];
      await playHalfMove(host, guest);
      const [hostLed, guestLed] = [host.received('trickLed', marks[0])[0], guest.received('trickLed', marks[1])[0]];
      assert.deepEqual(hostLed, { mine: true, card: led });
      assert.deepEqual(guestLed, { mine: false, card: led });
      assert.deepEqual(host.state.myPendingCard, led);
      assert.deepEqual(guest.state.currentAiCard, led);
      assert.equal(guest.state.myTurn, true);

      // Guest responds; the trick resolves, mirrored per seat.
      const answer = guest.state.playerHand[0];
      marks = [host.mark(), guest.mark()];
      await playHalfMove(host, guest);
      const hostRes = host.received('trickResolved', marks[0])[0];
      const guestRes = guest.received('trickResolved', marks[1])[0];
      assert.equal(hostRes.humanLed, true);
      assert.equal(guestRes.humanLed, false);
      assert.deepEqual([hostRes.playerCard, hostRes.aiCard], [led, answer]);
      assert.deepEqual([guestRes.playerCard, guestRes.aiCard], [answer, led]);
      assert.notEqual(hostRes.winner, guestRes.winner);
      assert.equal(hostRes.trickPoints, guestRes.trickPoints);

      for (const s of [host.state, guest.state]) assert.equal(s.deckCount, 31);
      assert.equal(host.state.playerPoints, guest.state.aiPoints);
      assert.equal(host.state.aiPoints, guest.state.playerPoints);
      const winner = hostRes.winner === 'player' ? host : guest;
      assert.equal(winner.state.myTurn, true, 'the trick winner leads next');
    }));

  test('a full game between two clients ends with mirrored scores', T, () =>
    withMatch(async ({ host, guest }) => {
      await playToEnd(host, guest, (a, b) => {
        assert.equal(a.seq, b.seq);
        assert.equal(a.playerPoints, b.aiPoints);
        assert.equal(a.aiPoints, b.playerPoints);
      });
      const [a, b] = [host.state, guest.state];
      assert.equal(a.playerPoints + a.aiPoints, 120);
      assert.equal(a.gameActive, false);
      const mirror = { player: 'ai', ai: 'player', tie: 'tie' };
      assert.equal(b.gameOver.winner, mirror[a.gameOver.winner]);
      assert.equal(a.turnDeadline, null, 'clock stops at game over');
    }));

  test('a quick reconnect inside the grace period goes unnoticed', T, () =>
    withMatch(async ({ host, guest, reopen }) => {
      await playHalfMove(host, guest);
      await playHalfMove(host, guest);
      const before = guest.state;
      const since = host.mark();
      guest.close();

      const back = await reopen('guest-again', guest.token);
      assert.equal(back.state.gameId, before.gameId);
      assert.equal(back.state.seq, before.seq);
      assert.deepEqual(back.state.playerHand, before.playerHand);

      // The resumed seat plays on as normal.
      await playHalfMove(host, back);
      await playHalfMove(host, back);

      // Outlast the grace window: the host must never have been told.
      await sleep(GRACE_MS + 2 * SWEEP_MS);
      assert.deepEqual(host.received('opponentDisconnected', since), []);
      assert.equal(host.state.opponentDisconnected, false);
    }));

  test('a drop past the grace period is flagged and pauses the clock until reconnect', T, () =>
    withMatch(async ({ host, guest, reopen }) => {
      const since = host.mark();
      const droppedAt = Date.now();
      guest.close();

      const notice = await host.next('opponentDisconnected', { since, timeout: FLAG_WITHIN_MS });
      const elapsed = Date.now() - droppedAt;
      assert.ok(elapsed >= GRACE_MS - SWEEP_MS - 500, `flagged after only ${elapsed}ms`);
      assert.ok(notice.disconnectDeadline > Date.now(), 'disconnect deadline is in the future');
      const paused = await host.next('gameState', { since, where: (s) => s.opponentDisconnected });
      assert.equal(paused.turnDeadline, null, 'turn clock paused');
      assert.equal(paused.disconnectDeadline, notice.disconnectDeadline);

      const resumedAt = host.mark();
      await reopen('guest-again', guest.token);
      await host.next('opponentReconnected', { since: resumedAt });
      const live = await host.next('gameState', { since: resumedAt, where: (s) => !s.opponentDisconnected });
      assert.ok(live.turnDeadline > Date.now(), 'turn clock resumed');
      assert.equal(live.disconnectDeadline, null);
    }));

  test('rematch: refused mid-game, then two votes restart in place', T, () =>
    withMatch(async ({ host, guest, gameId, reopen }) => {
      assert.equal((await host.expectError('requestRematch', { gameId })).code, 'cannotRematch');
      await playToEnd(host, guest);

      // First vote is mirrored to both seats; the game stays over.
      let marks = [host.mark(), guest.mark()];
      host.socket.emit('requestRematch', { gameId });
      const [hostView, guestView] = await Promise.all([
        host.next('gameState', { since: marks[0], where: (s) => s.rematch.me, failOnError: true }),
        guest.next('gameState', { since: marks[1], where: (s) => s.rematch.opponent, failOnError: true })
      ]);
      assert.deepEqual(hostView.rematch, { me: true, opponent: false });
      assert.deepEqual(guestView.rematch, { me: false, opponent: true });
      assert.equal(hostView.gameActive, false);

      // Second vote deals a fresh game under the same id.
      marks = [host.mark(), guest.mark()];
      guest.socket.emit('requestRematch', { gameId });
      const fresh = await Promise.all([
        host.next('gameState', { since: marks[0], where: (s) => s.gameActive, failOnError: true }),
        guest.next('gameState', { since: marks[1], where: (s) => s.gameActive, failOnError: true })
      ]);
      for (const s of fresh) {
        assert.equal(s.gameId, gameId);
        assert.equal(s.deckCount, 33);
        assert.equal(s.playerPoints + s.aiPoints, 0);
        assert.deepEqual(s.rematch, { me: false, opponent: false });
      }
      assert.equal(fresh[0].myTurn, true, 'host leads the rematch');

      // Reconnect tokens survive the restart, and the new game is playable.
      const back = await reopen('guest-again', guest.token);
      assert.equal(back.state.gameId, gameId);
      assert.equal(back.state.gameActive, true);
      await playHalfMove(host, back);
    }));

  test('endGame: refused while the opponent is connected, ends the session after a flagged drop', T, () =>
    withMatch(async ({ host, guest, code, gameId }) => {
      assert.equal((await host.expectError('endGame', { gameId })).code, 'cannotEndGame');

      const since = host.mark();
      guest.close();
      await host.next('opponentDisconnected', { since, timeout: FLAG_WITHIN_MS });
      const ended = await host.request('endGame', { gameId }, 'gameTerminated');
      assert.equal(ended.reason, 'youEnded');

      // Tokens and the room code are gone with the session.
      const probe = await Client.open('probe');
      try {
        for (const token of [host.token, guest.token]) {
          assert.equal((await probe.expectError('reconnectMultiplayerGame', { token })).code, 'unknownGame');
        }
        const join = await probe.expectError('joinMultiplayerGame', { code, name: 'it-probe' });
        assert.equal(join.code, 'unknownLobby');
      } finally {
        probe.close();
      }
    }));
});
