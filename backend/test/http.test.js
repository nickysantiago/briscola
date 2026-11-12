// HTTP route tests: /health liveness and the /api/status build-info + Redis
// probe used by the post-deploy smoke tests. Run with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHttpHandler } from '../http.js';

const build = { commit: 'abc123def456', version: '1.0.0' };

// Serve a handler on an ephemeral port; returns a fetch-style getter and close().
async function serve(options) {
  const server = createServer(createHttpHandler({ build, ...options }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    get: (path) => fetch(base + path),
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

test('/health: plain ok, no dependency checks', async (t) => {
  const pingStore = t.mock.fn(async () => {});
  const app = await serve({ pingStore });
  try {
    const res = await app.get('/health');
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'ok');
    assert.equal(pingStore.mock.callCount(), 0);
  } finally {
    await app.close();
  }
});

test('/api/status: 200 with build info when Redis answers', async () => {
  const startedAt = 1_000_000;
  const app = await serve({
    pingStore: async () => {},
    startedAt,
    now: () => startedAt + 42_500
  });
  try {
    const res = await app.get('/api/status');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/json/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), {
      status: 'ok',
      commit: 'abc123def456',
      version: '1.0.0',
      uptimeSeconds: 42,
      redis: 'ok'
    });
  } finally {
    await app.close();
  }
});

test('/api/status: ignores a query string', async () => {
  const app = await serve({ pingStore: async () => {} });
  try {
    const res = await app.get('/api/status?cachebust=1');
    assert.equal(res.status, 200);
  } finally {
    await app.close();
  }
});

test('/api/status: 503 degraded when the Redis ping fails', async (t) => {
  t.mock.method(console, 'error', () => {});
  const app = await serve({
    pingStore: async () => {
      throw new Error('redis client not ready');
    }
  });
  try {
    const res = await app.get('/api/status');
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.status, 'degraded');
    assert.equal(body.redis, 'down');
    assert.equal(body.commit, 'abc123def456');
  } finally {
    await app.close();
  }
});

test('/api/status: 503 when the Redis ping hangs past the timeout', async (t) => {
  t.mock.method(console, 'error', () => {});
  const app = await serve({
    pingStore: () => new Promise(() => {}), // never settles, like a queued command
    pingTimeoutMs: 20
  });
  try {
    const res = await app.get('/api/status');
    assert.equal(res.status, 503);
    assert.equal((await res.json()).redis, 'down');
  } finally {
    await app.close();
  }
});

test('unknown paths are 404', async () => {
  const app = await serve({ pingStore: async () => {} });
  try {
    assert.equal((await app.get('/')).status, 404);
    assert.equal((await app.get('/api/nope')).status, 404);
  } finally {
    await app.close();
  }
});
