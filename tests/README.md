# Live tests

Black-box tests that run against a **deployed** Brisca stack: they only know a
URL, never the source. `Jenkinsfile_post` runs them against staging after ArgoCD
deploys a new version. Unit and golden-master tests live in `backend/test/` and
run in the main `Jenkinsfile` instead.

| Suite | Status | What it answers |
|---|---|---|
| `smoke/` | ✅ | Is the expected build live and wired end to end? (~1s) |
| `integration/` | ✅ | Does the Socket.io protocol behave end to end? (~15s) |
| `e2e/` | ✅ | Does the game work in a real browser? (Playwright, ~3 min) |
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

## E2E suite

11 Playwright tests (`e2e/*.spec.mjs`, config in `playwright.config.mjs`). They
cover what only a browser can: rendering, click and drag-and-drop, the trick
animations finishing, `localStorage` resume, and the multiplayer panels.

| Project | Runs | Viewport |
|---|---|---|
| `desktop-chromium` | everything | 1280×720 desktop |
| `iphone-webkit` | `solo.spec.mjs` only | iPhone 13 (Safari engine, touch) |

| File | Covers |
|---|---|
| `solo.spec.mjs` | new game board, a trick by click, a trick by drag-and-drop, refresh + home-button resume, a full game to the game-over panel then New Game |
| `multiplayer.spec.mjs` | two browser contexts meeting via a room code, a mirrored trick, reload back into the seat, the disconnect panel + End Game, join-form validation and "room full", a full game + rematch request + leaving (regression for the finished-game resume hijack) |

Notes:

- Elements are found by role, accessible name and visible text, so the frontend
  needs no test-only attributes. Hand cards are buttons only while playable, which
  `playableCards()` in `e2e/support.mjs` uses as the "it's my move" signal.
- Every test fails on an uncaught page error or `console.error` in any of its
  browsers (the `browserErrors` fixture).
- Full games play the real animations (~4-6s per trick), so those tests take about
  2 minutes. Tests run 4 at a time (`E2E_WORKERS` to change), so the suite takes
  about as long as its slowest test.
- Wait for `waitForLoaded()` before raw mouse input: the loading overlay fades out
  over the already-rendered board, and only Playwright's `click()`/`hover()` wait
  for it on their own.
- `@playwright/test` is pinned to an exact version that must match the
  `mcr.microsoft.com/playwright` image tag in `Jenkinsfile_post`.
- Failures keep a trace, screenshot and video under `reports/e2e-artifacts/`, and
  `reports/e2e-html/index.html` is the full report.

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

E2E needs the browsers, so run it in the Playwright image (same tag as `@playwright/test`):

```bash
docker run --rm --ipc=host -v "$PWD/tests":/work -w /work -e BASE_URL=https://brisca.nsantiago.me mcr.microsoft.com/playwright:v1.64.1-noble sh -c 'npm ci && npm run e2e'
```

`npx playwright test e2e/solo.spec.mjs --project=desktop-chromium` runs one file on
one browser; `npm run e2e:ci` retries a failed test once (reported as flaky).

## Side effects

Every game a test creates stays in Redis until its TTL expires. A smoke run leaves
one solo game. An integration run leaves a few dozen solo games and claims about
12 of the 10,000 lobby codes, which are held for up to 24h. An E2E run leaves about
a dozen solo games and holds about 6 lobby codes. Staging only.
