// Test doubles for the multiplayer layer: an in-memory store implementing the
// store.js surface (with JSON round-trips, mirroring Redis serialization), a
// capture-everything fake socket, and a manually-advanced clock.

export function createMemoryStore() {
  const games = new Map();
  const lobbies = new Map();
  const tokens = new Map();
  const active = new Set();
  const ttls = new Map(); // records the last TTL written per key (no expiry simulation)

  return {
    async loadState(gameId) {
      const raw = games.get(gameId);
      return raw ? JSON.parse(raw) : null;
    },
    async saveState(state) {
      games.set(state.gameId, JSON.stringify(state));
      ttls.set(`game:${state.gameId}`, state.gameActive ? 86400 : 3600);
    },
    async deleteGame(gameId) {
      games.delete(gameId);
    },
    async claimLobbyCode(code, record) {
      if (lobbies.has(code)) return false; // NX semantics
      lobbies.set(code, JSON.stringify(record));
      ttls.set(`lobby:${code}`, 3600);
      return true;
    },
    async loadLobby(code) {
      const raw = lobbies.get(code);
      return raw ? JSON.parse(raw) : null;
    },
    async saveLobby(record, ttlSeconds = 86400) {
      lobbies.set(record.code, JSON.stringify(record));
      ttls.set(`lobby:${record.code}`, ttlSeconds);
    },
    async deleteLobby(code) {
      lobbies.delete(code);
    },
    async saveToken(token, record) {
      tokens.set(token, JSON.stringify(record));
    },
    async loadToken(token) {
      const raw = tokens.get(token);
      return raw ? JSON.parse(raw) : null;
    },
    async deleteToken(token) {
      tokens.delete(token);
    },
    async addActiveMp(gameId) {
      active.add(gameId);
    },
    async removeActiveMp(gameId) {
      active.delete(gameId);
    },
    async listActiveMp() {
      return [...active];
    },
    // test inspection helpers
    ttlOf(key) {
      return ttls.get(key);
    },
    games,
    lobbies,
    tokens,
    active
  };
}

let socketSeq = 0;

export function fakeSocket(id = `sock-${++socketSeq}`) {
  const events = [];
  const handlers = new Map();
  const socket = {
    id,
    connected: true,
    events,
    handlers,
    emit(event, payload) {
      events.push({ event, payload });
    },
    on(event, fn) {
      handlers.set(event, fn);
    },
    // Invoke a registered client->server handler (as socket.io would).
    send(event, payload) {
      const fn = handlers.get(event);
      if (!fn) throw new Error(`no handler bound for ${event}`);
      return fn(payload);
    },
    last(event) {
      for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].event === event) return events[i].payload;
      }
      return undefined;
    },
    all(event) {
      return events.filter((e) => e.event === event).map((e) => e.payload);
    },
    disconnect() {
      socket.connected = false;
      const fn = handlers.get('disconnect');
      if (fn) fn();
    }
  };
  return socket;
}

export function fakeClock(start = 1_000_000_000) {
  let t = start;
  const now = () => t;
  now.advance = (ms) => {
    t += ms;
    return t;
  };
  now.set = (ms) => {
    t = ms;
  };
  return now;
}

// rng stub that replays a fixed queue, then falls back to the last value.
export function rngQueue(values) {
  let i = 0;
  return () => {
    const v = values[Math.min(i, values.length - 1)];
    i++;
    return v;
  };
}
