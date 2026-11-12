# Live tests

Black-box tests that run against a **deployed** Brisca stack: they only know a
URL, never the source. `Jenkinsfile_post` runs them against staging after ArgoCD
deploys a new version. Unit and golden-master tests live in `backend/test/` and
run in the main `Jenkinsfile` instead.

| Suite | Status | What it answers |
|---|---|---|
| `smoke/` | ✅ | Is the expected build live and wired end to end? (~1s) |
| `integration/` | planned | Does the Socket.io protocol behave (full games, resume, multiplayer)? |
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

## Running

No Node on the host? Run through Docker (`node:lts-slim` is what Jenkins uses):

```bash
docker run --rm -v "$PWD/tests":/work -w /work -e BASE_URL=https://brisca.nsantiago.me node:lts-slim sh -c 'npm ci && npm run smoke'
```

Against the local compose stack, stamp the build first so the gate has a commit to compare:

```bash
GIT_COMMIT=$(git rev-parse HEAD) docker compose up -d --build
```

`npm run smoke:ci` does the same as `npm run smoke` and also writes a JUnit report
to `reports/smoke-junit.xml` for Jenkins.

## Side effects

The smoke suite starts one solo game and plays one trick per run. That game sits
in Redis until its 24h TTL expires. Nothing else is written.
