# Brisca frontend

A SvelteKit + Tailwind CSS static app. It is a **Socket.io client only** — the
backend is the sole authority on game state; the frontend never re-implements
game rules. It renders the server's public snapshots and replays trick
animations from server outcomes.

## Module responsibilities

| Module | Responsibility |
|---|---|
| `src/lib/net.ts` | Socket.io bootstrap (`io()` created once from `onMount`) and emit helpers for `newGame`, `playCard`, `resume`. Wires the three server events (`gameState`, `trickResolved`, `errorState`) to the state module and orchestrator, including the stale/unknownGame recovery paths. |
| `src/lib/game.svelte.ts` | Reactive client state (Svelte 5 runes). Two-buffer design: `latest` (non-reactive authoritative snapshot buffer) vs `game.view` (what the board renders). While a trick animates (`game.busy`), incoming snapshots are stashed in `latest`; `settle()` promotes them to `view` when the animation finishes. Also owns the `brisca:gameId` localStorage persistence for resume. |
| `src/lib/orchestrator.ts` | The per-trick animation sequence. Mutates reactive state on a schedule (card leaves hand → AI responds → winner banner → cards fly to pile → board settles → AI lead flies in); Svelte transitions turn each mutation into a flight. All animation timing lives here + `constants.ts`. |
| `src/lib/transitions.ts` | Shared `crossfade` send/receive pair — cards visually fly between hand, play area, and winner piles. |
| `src/lib/constants.ts` | Animation timings, card image/key helpers, localStorage key. Game rules live server-side. |
| `src/lib/types.ts` | TypeScript shapes of the Socket.io contract (snapshot, trick outcome, errors). |
| `src/lib/components/` | The screen/component tree: `TitleScreen`, `DifficultySelect`, `GameBoard` (+ `GameInfo`, `TurnIndicator`, `TrumpCard`, `PlayArea`, `Hand`, `CardView`, `WinnerPile`, `PointsPopup`, `GameOverPanel`), `FooterBar`. |
| `src/routes/` | Single prerendered route (`ssr = false`, `prerender = true`): connects the socket, preloads card art, resumes a stored game, and switches between the three screens. |
| `static/cards/` | The original 40 card PNGs (`{value}_of_{suit}.png`), served at `cards/…` as before. |
| `src/app.css` | Tailwind v4 theme: palette, radii, shadows, and animation keyframes. |

## Key invariants

- The snapshot never includes the AI's hand or deck contents.
- `playCard` echoes the server's `seq` token; a `stale` error triggers a
  `resume` re-sync. The client `busy` lock is purely cosmetic click-blocking
  during animations.
- Resume: `gameId` is stored in localStorage on every `gameState` and replayed
  via `resume` on page load.

## Development (no Node needed on the host)

```bash
# Install deps / refresh the lockfile
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD":/app -w /app node:20-alpine npm install

# Dev server against the live backend: join the compose network so the Vite
# proxy can reach http://backend:3000 (start backend+redis first).
docker compose up -d backend redis          # from the repo root
NET=$(docker inspect brisca-backend -f '{{range $k,$_ := .NetworkSettings.Networks}}{{$k}}{{end}}')
docker run --rm -it -u "$(id -u):$(id -g)" -e HOME=/tmp \
  --network "$NET" -p 5173:5173 \
  -v "$PWD":/app -w /app node:20-alpine npm run dev
# open http://localhost:5173

# Type check
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD":/app -w /app node:20-alpine npm run check
```

Production build is done inside the Docker image (multi-stage `Dockerfile`):
`docker compose up -d --build` from the repo root, then open
http://localhost:8080.
