// Headless protocol test — drives the real Socket.io server with no browser.
// Requires the backend running and reachable at BACKEND_URL (default :3000).
//
//   node scripts/socket-smoke.mjs        (from the backend/ directory)
//
// Exercises: newGame, a full game via playCard, mid-game resume on a fresh
// connection, the stale-seq turn guard, and post-game-over rejection.

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

function newGame(socket, difficulty) {
  return new Promise((resolve, reject) => {
    socket.once('gameState', resolve);
    socket.once('errorState', (e) => reject(new Error('newGame error: ' + e.code)));
    socket.emit('newGame', { difficulty });
  });
}

function resume(socket, gameId) {
  return new Promise((resolve, reject) => {
    socket.once('gameState', resolve);
    socket.once('errorState', (e) => reject(new Error('resume error: ' + e.code)));
    socket.emit('resume', { gameId });
  });
}

// Resolves with { outcome, state } on success (trickResolved then gameState),
// or rejects with an Error carrying .code on errorState.
function playCard(socket, gameId, index, seq) {
  return new Promise((resolve, reject) => {
    let outcome = null;
    const onTrick = (o) => { outcome = o; };
    const onState = (s) => { cleanup(); resolve({ outcome, state: s }); };
    const onErr = (e) => { cleanup(); reject(Object.assign(new Error('errorState'), { code: e.code })); };
    function cleanup() {
      socket.off('trickResolved', onTrick);
      socket.off('gameState', onState);
      socket.off('errorState', onErr);
    }
    socket.on('trickResolved', onTrick);
    socket.on('gameState', onState);
    socket.on('errorState', onErr);
    socket.emit('playCard', { gameId, index, seq });
  });
}

async function main() {
  const s = await connect();
  console.log('connected to', URL);

  // 1. New game.
  let snap = await newGame(s, 'hard');
  assert.equal(snap.seq, 0, 'fresh game seq=0');
  assert.equal(snap.playerLeads, true, 'human leads first');
  assert.equal(snap.aiHandCount, 3);
  assert.equal(snap.deckCount, 33);
  assert.ok(!('aiHand' in snap) && !('deck' in snap), 'no private leakage');
  const gameId = snap.gameId;
  console.log('newGame OK  gameId=%s trump=%s%d', gameId, snap.trumpCard.suit, snap.trumpCard.value);

  // 2. Play three moves.
  for (let i = 0; i < 3; i++) {
    const { outcome, state } = await playCard(s, gameId, 0, snap.seq);
    assert.ok(state.seq > snap.seq, 'seq advances'); // per half-move: 2-3 per solo trick
    assert.equal(typeof outcome.winner, 'string');
    snap = state;
  }
  const mid = snap;
  console.log('played 3 tricks OK  seq=%d score %d-%d', mid.seq, mid.playerPoints, mid.aiPoints);

  // 3. Resume on a brand-new connection — must match the persisted state.
  const s2 = await connect();
  const resumed = await resume(s2, gameId);
  assert.equal(resumed.seq, mid.seq, 'resume seq matches');
  assert.equal(resumed.playerPoints, mid.playerPoints, 'resume player score matches');
  assert.equal(resumed.aiPoints, mid.aiPoints, 'resume AI score matches');
  assert.equal(resumed.deckCount, mid.deckCount, 'resume deck count matches');
  assert.equal(JSON.stringify(resumed.playerHand), JSON.stringify(mid.playerHand), 'resume hand matches');
  console.log('resume OK  (state survived a fresh connection)');

  // 4. Stale seq is rejected (turn guard).
  await assert.rejects(
    () => playCard(s2, gameId, 0, resumed.seq + 999),
    (e) => e.code === 'stale',
    'stale seq must be rejected with code "stale"'
  );
  console.log('stale-seq guard OK');

  // 5. Finish the game.
  let cur = resumed;
  let guard = 0;
  while (!cur.gameOver) {
    if (++guard > 60) throw new Error('runaway: game never ended');
    const { state } = await playCard(s2, gameId, 0, cur.seq);
    cur = state;
  }
  assert.equal(cur.gameActive, false, 'game inactive at end');
  assert.equal(cur.playerPoints + cur.aiPoints, 120, 'points sum to 120');
  assert.ok(['player', 'ai', 'tie'].includes(cur.gameOver.winner));
  console.log('full game OK  winner=%s  %d-%d', cur.gameOver.winner, cur.playerPoints, cur.aiPoints);

  // 6. Playing after game over is rejected.
  await assert.rejects(
    () => playCard(s2, gameId, 0, cur.seq),
    (e) => e.code === 'gameOver',
    'post-game move must be rejected with code "gameOver"'
  );
  console.log('post-game-over guard OK');

  s.close();
  s2.close();
  console.log('\nSOCKET SMOKE PASSED');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nSOCKET SMOKE FAILED:', err);
  process.exit(1);
});
