# Live tests

Black-box tests that run against a **deployed** Brisca stack: they only know a
URL, never the source. `Jenkinsfile_post` runs them against staging after ArgoCD
deploys a new version. Unit and golden-master tests live in `backend/test/` and
run in the main `Jenkinsfile` instead.

| Suite | Status | What it answers |
|---|---|---|
| `smoke/` | ✅ | Is the expected build live and wired end to end? (~1s) |
| `integration/` | ✅ | Does the Socket.io protocol behave end to end? (~15s) |
| `e2e/` | planned | Does the game work in a real browser? (Playwright) |
| `stress/` | planned | How does it hold up under load? (staging only) |

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `BASE_URL` | `http://localhost:8080` | Where the frontend is served |
| `EXPECTED_VERSION` | _(empty)_ | Commit that should be live: full SHA, git short SHA, or the 5-char image tag. Empty = frontend and backend only need to report the same commit. |
| `VERSION_WAIT_SECONDS` | `180` | How long to wait for that build to roll out before failing |

## How the version gate works

Both images are stamped with the commit they were built from (`--build-arg
GIT_COMMIT=...` in the `Jenkinsfile`):

- frontend serves `GET /version.json` → `{"commit": "..."}`
- backend serves `GET /api/status` → `{"status", "commit", "version", "uptimeSeconds", "redis"}`
  (200 when Redis answers a PING, 503 when it doesn't)

Before any test runs, the suite polls both until they report `EXPECTED_VERSION`.
If the rollout doesn't finish in time, every test is cancelled and the error
shows which commits are actually deployed, so a stale deploy is never tested.

## Integration suite

22 tests in 4 files, run in parallel. They cover what the backend unit tests
can't: `server.js` wiring, real Redis, real sockets through the proxy, and the
real-time sweep. Game rules and AI quality stay in `backend/test/`.

| File | Covers |
|---|---|
| `solo.test.mjs` | difficulties, a full hard game with per-trick invariants, resume, stale/illegal/post-game moves, concurrent duplicate moves, unknown games |
| `lobby.test.mjs` | create/join with seat-relative views, name/code validation, full lobby, host reconnecting to a waiting lobby (before and after the guest joins) |
| `multiplayer.test.mjs` | turn order + mirrored trick events, a full two-player game, reconnect inside the grace period, a flagged disconnect pausing the clock, rematch, endGame |
| `guards.test.mjs` | outsiders can't act on a match, snapshots carry only public fields (exact key list) and never the opponent's hand, malformed payloads never crash the server |

The disconnect tests wait out the backend's 8s grace period, so the multiplayer
file sets the wall-clock time. If `GRACE_MS` in `backend/multiplayer.js` changes,
update the mirror at the top of `multiplayer.test.mjs`. The guards test pins the
snapshot field list on purpose: a new field fails it until reviewed for leaks.

Multi-socket tests use `lib/client.mjs`, which records every event a socket
receives so a test can wait for one that may already have arrived, or assert one
never did.

## Running

No Node on the host? Run through Docker (`node:lts-slim` is what Jenkins uses):

```bash
docker run --rm -v "$PWD/tests":/work -w /work -e BASE_URL=https://brisca.nsantiago.me node:lts-slim sh -c 'npm ci && npm run smoke'
```

Against the local compose stack, stamp the build first so the gate has a commit to compare:

```bash
GIT_COMMIT=$(git rev-parse HEAD) docker compose up -d --build
```

`npm run integration` runs the integration suite the same way. The `:ci` variants
(`smoke:ci`, `integration:ci`) also write JUnit reports to `reports/` for Jenkins.

## Side effects

Every game a test creates stays in Redis until its TTL expires. A smoke run leaves
one solo game. An integration run leaves a few dozen solo games and claims about
12 of the 10,000 lobby codes, which are held for up to 24h. Staging only.
