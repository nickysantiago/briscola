# Brisca

A browser version of **Brisca**, the traditional Spanish trick-taking card game —
human vs. AI, with Easy / Normal / Hard opponents.

The game logic, state, and AI run on a Node.js backend; game state lives in Redis so
you can refresh or close the tab and resume exactly where you left off. The browser
talks to the backend exclusively over Socket.io. Everything runs locally on a LAN.

## Architecture

Three containers, orchestrated by Docker Compose:

| Service    | What it is                          | Port                         |
|------------|-------------------------------------|------------------------------|
| `frontend` | nginx — static site + Socket.io proxy | `8080` (published)         |
| `backend`  | Node.js — game engine, AI, Socket.io | `3000` (internal only)      |
| `redis`    | Game-state store (AOF + RDB)        | `6379` (internal only)       |

The browser only ever talks to the frontend on `:8080`. nginx reverse-proxies
`/socket.io/` to the backend, so there is a single origin and no CORS. Redis persists
to a named Docker volume (`redis-data`) using both AOF and RDB, so game state survives
container restarts.

```
frontend/   static site (index.html, css/, cards/, js/) + nginx.conf + Dockerfile
backend/    server.js, store.js, game/{constants,engine,ai}.js, tests
docker-compose.yml
```

## Run

```bash
docker-compose up -d --build
```

Then open `http://<host>:8080` (e.g. `http://localhost:8080`). To change the published
port, edit `ports:` under `frontend` in `docker-compose.yml`.

```bash
docker-compose down          # stop (Redis data is kept in the redis-data volume)
docker-compose down -v       # stop AND delete the Redis volume (wipes saved games)
docker-compose logs -f backend
```

> Uses `docker-compose` (v1). If your host has the Compose v2 plugin, use
> `docker compose` instead.

## Development & tests

The backend has no runtime DOM dependencies and can be tested directly with Node 18+.

```bash
cd backend
npm install

# Unit + golden-master tests (engine rules, draw logic, AI, full-game invariants):
npm test

# Headless end-to-end protocol test (needs a running backend + redis):
docker run -d --name brisca-redis-dev -p 6379:6379 redis:7-alpine
REDIS_URL=redis://localhost:6379 node server.js &
node scripts/socket-smoke.mjs
```

## How it works

- The server is the sole authority on game state. A card click emits `playCard`; the
  server resolves the whole trick (including the AI's move) atomically, persists to
  Redis, and replies with a `trickResolved` outcome plus a public `gameState` snapshot.
- The frontend keeps the original CSS/animations; it replays the same card-flight and
  scoring animations from the server outcome. All animation timing lives on the client.
- A per-game `seq` turn token rejects stale/duplicate moves (double-click, reconnect).
- The snapshot sent to the browser never includes the AI's hand, the deck contents, or
  the AI's card-counting state — so the opponent can't be read from devtools.
