// Shared settings for the live test suites, read from the environment so the
// same tests run against a local stack or staging.
//
//   BASE_URL              where the frontend is served (default http://localhost:8080)
//   EXPECTED_VERSION      commit that should be live: full SHA, git short SHA, or the
//                         5-char image tag. Empty = only require frontend and backend
//                         to report the same commit.
//   VERSION_WAIT_SECONDS  how long to wait for that build to roll out (default 180)

export const BASE_URL = (process.env.BASE_URL || 'http://localhost:8080').replace(/\/+$/, '');
export const EXPECTED_VERSION = (process.env.EXPECTED_VERSION || '').trim();
export const VERSION_WAIT_SECONDS = Number(process.env.VERSION_WAIT_SECONDS || 180);

export const REQUEST_TIMEOUT_MS = 10_000;

// fetch() against BASE_URL with a timeout and no caching.
export function get(path) {
  return fetch(BASE_URL + path, {
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
}
