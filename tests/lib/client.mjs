// A recording game client for multi-socket tests. Every inbound event is logged
// in arrival order, so a test can wait for an event that may already have
// arrived (no listen-before-emit races) or assert one never arrived at all.

import { connect } from './socket.mjs';

const WAIT_MS = 10_000;

export class Client {
  constructor(socket, label) {
    this.socket = socket;
    this.label = label;
    this.log = []; // [{ event, payload }]
    this.state = null; // latest gameState snapshot
    this.token = null; // multiplayer reconnect token, once issued
    this.waiters = new Set();
    socket.onAny((event, payload) => {
      this.log.push({ event, payload });
      if (event === 'gameState') this.state = payload;
      if ((event === 'lobbyCreated' || event === 'lobbyJoined') && payload?.token) this.token = payload.token;
      for (const check of this.waiters) check();
    });
  }

  static async open(label = 'client') {
    return new Client(await connect(), label);
  }

  // Position in the log; pass as `since` to only match events after this point.
  mark() {
    return this.log.length;
  }

  // Payloads of `event` received at or after `since`.
  received(event, since = 0) {
    return this.log.slice(since).filter((e) => e.event === event).map((e) => e.payload);
  }

  // Resolve with the first `event` payload at or after `since` that satisfies
  // `where`. With `failOnError`, an errorState in that window rejects instead
  // (carrying the server's `.code`).
  async next(event, options = {}) {
    return (await this.nextOf([event], options)).payload;
  }

  // Like next(), for whichever of `events` arrives first: { event, payload }.
  nextOf(events, { since = this.mark(), where = () => true, timeout = WAIT_MS, failOnError = false } = {}) {
    const wanted = events.join('|');
    return new Promise((resolve, reject) => {
      let scanned = since;
      const check = () => {
        for (; scanned < this.log.length; scanned++) {
          const entry = this.log[scanned];
          if (events.includes(entry.event) && where(entry.payload)) return done(null, entry);
          if (failOnError && entry.event === 'errorState') {
            const code = entry.payload?.code;
            return done(Object.assign(new Error(`${this.label}: errorState ${code} while waiting for ${wanted}`), { code }));
          }
        }
      };
      const timer = setTimeout(() => done(new Error(`${this.label}: no ${wanted} within ${timeout}ms`)), timeout);
      const done = (err, entry) => {
        clearTimeout(timer);
        this.waiters.delete(check);
        if (err) reject(err);
        else resolve(entry);
      };
      this.waiters.add(check);
      check();
    });
  }

  // Emit and wait for `replyEvent`; an errorState reply rejects with its `.code`.
  request(event, payload, replyEvent, options = {}) {
    const since = this.mark();
    this.socket.emit(event, payload);
    return this.next(replyEvent, { ...options, since, failOnError: true });
  }

  // Emit and wait for the errorState it provokes; resolves with that payload.
  expectError(event, payload, options = {}) {
    const since = this.mark();
    this.socket.emit(event, payload);
    return this.next('errorState', { ...options, since });
  }

  close() {
    this.socket.close();
  }
}

// ---------------------------------------------------------------------------
// Multiplayer flows
// ---------------------------------------------------------------------------

// Short unique-ish player names (max 16 chars) so server logs are traceable.
export const playerName = (role) => `it-${role}-${Math.random().toString(36).slice(2, 7)}`;

export async function createLobby(host, name = playerName('host')) {
  return host.request('createMultiplayerGame', { name }, 'lobbyCreated');
}

// Host creates, guest joins; resolves once both seats hold the first snapshot.
export async function startMatch() {
  const host = await Client.open('host');
  const guest = await Client.open('guest');
  const hostName = playerName('host');
  const guestName = playerName('guest');
  const { code } = await createLobby(host, hostName);
  const hostSince = host.mark();
  await guest.request('joinMultiplayerGame', { code, name: guestName }, 'gameState');
  await host.next('gameState', { since: hostSince });
  return { host, guest, code, hostName, guestName, gameId: host.state.gameId };
}

// Play one half-move with whichever seat is due, then wait until both seats
// hold the snapshot that follows it. Returns the actor.
export async function playHalfMove(host, guest, index = 0) {
  const actor = host.state.myTurn ? host : guest;
  const seq = actor.state.seq;
  const marks = [host.mark(), guest.mark()];
  actor.socket.emit('playCard', { gameId: actor.state.gameId, index, seq });
  await Promise.all([
    host.next('gameState', { since: marks[0], where: (s) => s.seq > seq, failOnError: true }),
    guest.next('gameState', { since: marks[1], where: (s) => s.seq > seq, failOnError: true })
  ]);
  return actor;
}

// Play half-moves until the game ends; `onStep` sees both seats after each one.
export async function playToEnd(host, guest, onStep = () => {}) {
  for (let i = 0; i < 40 && host.state.gameActive; i++) {
    await playHalfMove(host, guest);
    onStep(host.state, guest.state);
  }
  if (host.state.gameActive) throw new Error('game still active after 40 half-moves');
}
