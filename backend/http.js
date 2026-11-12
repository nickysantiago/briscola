// http.js - plain-HTTP routes served alongside Socket.io.
//
//   GET /health      liveness: 'ok' while the process is up (no dependencies)
//   GET /api/status  build info + Redis reachability, as JSON. 200 when Redis
//                    answers a PING, 503 when it doesn't. nginx proxies /api/ to
//                    this process, so post-deploy tests use it to confirm which
//                    commit is live before testing it.

const PING_TIMEOUT_MS = 1000;

// Rejects if `promise` hasn't settled within `ms`. node-redis queues commands
// while disconnected, so an un-timed PING would hang instead of failing.
function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

export function createHttpHandler({
  pingStore,
  build,
  startedAt = Date.now(),
  now = Date.now,
  pingTimeoutMs = PING_TIMEOUT_MS
}) {
  return async (req, res) => {
    const path = req.url.split('?')[0];

    if (path === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }

    if (path === '/api/status') {
      let redis = 'ok';
      try {
        await withTimeout(pingStore(), pingTimeoutMs);
      } catch (err) {
        console.error('[status] redis ping failed:', err.message);
        redis = 'down';
      }
      sendJson(res, redis === 'ok' ? 200 : 503, {
        status: redis === 'ok' ? 'ok' : 'degraded',
        commit: build.commit,
        version: build.version,
        uptimeSeconds: Math.floor((now() - startedAt) / 1000),
        redis
      });
      return;
    }

    res.writeHead(404);
    res.end();
  };
}
