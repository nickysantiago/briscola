// Persistence checker: `create` starts a game and plays a few tricks, printing a
// RESULT summary incl. the gameId; `resume <gameId>` reconnects and prints the same
// summary. Run create, restart the stack, then resume to prove Redis state survived.
import { io } from 'socket.io-client';

const URL = process.env.BACKEND_URL || 'http://localhost:8090';
const mode = process.argv[2];
const gid = process.argv[3];

const connect = () => new Promise((res, rej) => {
  const s = io(URL, { transports: ['websocket'], reconnection: false, timeout: 5000 });
  s.once('connect', () => res(s));
  s.once('connect_error', (e) => rej(e));
});
const once = (s, ev) => new Promise((r) => s.once(ev, r));
const play = (s, gameId, index, seq) => new Promise((res, rej) => {
  const st = (x) => { cleanup(); res(x); };
  const er = (x) => { cleanup(); rej(Object.assign(new Error('err'), { code: x.code })); };
  function cleanup() { s.off('gameState', st); s.off('errorState', er); }
  s.on('gameState', st);
  s.on('errorState', er);
  s.emit('playCard', { gameId, index, seq });
});

const s = await connect();
let snap;
if (mode === 'create') {
  s.emit('newGame', { difficulty: 'hard' });
  snap = await once(s, 'gameState');
  for (let i = 0; i < 4; i++) snap = await play(s, snap.gameId, 0, snap.seq);
} else {
  s.emit('resume', { gameId: gid });
  snap = await once(s, 'gameState');
}
console.log('RESULT ' + JSON.stringify({
  gameId: snap.gameId, seq: snap.seq, p: snap.playerPoints, g: snap.gptPoints,
  deck: snap.deckCount, hand: snap.playerHand
}));
s.close();
process.exit(0);
