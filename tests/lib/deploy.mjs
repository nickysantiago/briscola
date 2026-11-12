// Which build is live? The frontend serves /version.json and the backend reports
// its commit at /api/status; both are stamped from the GIT_COMMIT build arg.
// Tests wait here first so they never run against a stale rollout.

import { get } from './config.mjs';

// { commit } on success, { error } if the endpoint is missing or unreadable.
// /api/status still reports its commit with a 503 (Redis down), so the body is
// read regardless of status; Redis health is asserted separately.
async function readCommit(path) {
  try {
    const res = await get(path);
    const body = await res.json().catch(() => null);
    if (!body?.commit) return { error: `HTTP ${res.status}, no commit in body` };
    return { commit: body.commit };
  } catch (err) {
    return { error: err.message };
  }
}

export async function fetchDeployedCommits() {
  const [frontend, backend] = await Promise.all([
    readCommit('/version.json'),
    readCommit('/api/status')
  ]);
  return { frontend, backend };
}

// A full SHA must match exactly. Shorter values may be a git short SHA (prefix)
// or the Jenkins image tag, which is the commit's LAST 5 characters (suffix).
export function commitMatches(commit, expected) {
  if (!commit || !expected) return false;
  if (expected.length >= commit.length) return commit === expected;
  return expected.length >= 5 && (commit.startsWith(expected) || commit.endsWith(expected));
}

function describe({ frontend, backend }) {
  const show = (side) => side.commit ?? `unavailable (${side.error})`;
  return `frontend=${show(frontend)} backend=${show(backend)}`;
}

function settled(commits, expected) {
  const { frontend, backend } = commits;
  if (!frontend.commit || !backend.commit) return false;
  if (expected) return commitMatches(frontend.commit, expected) && commitMatches(backend.commit, expected);
  return frontend.commit === backend.commit;
}

// Poll until the expected build is live on both tiers (or, with no expectation,
// until both tiers agree). Resolves with the commits; throws on timeout.
export async function waitForDeploy({ expected, timeoutSeconds, intervalMs = 5000, log = console.log }) {
  const target = expected ? `commit ${expected}` : 'frontend and backend to report the same commit';
  const deadline = Date.now() + timeoutSeconds * 1000;
  log(`Waiting up to ${timeoutSeconds}s for ${target}`);

  for (;;) {
    const commits = await fetchDeployedCommits();
    if (settled(commits, expected)) {
      log(`Deployed: ${describe(commits)}`);
      return commits;
    }
    if (Date.now() + intervalMs > deadline) {
      throw new Error(`Timed out after ${timeoutSeconds}s waiting for ${target}; last seen ${describe(commits)}`);
    }
    log(`Not yet: ${describe(commits)}`);
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
