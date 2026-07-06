// lock.js - Per-key in-process async mutex.
//
// Multiplayer mutations on one game can arrive from two sockets AND the timer
// sweep concurrently. The seq turn-token alone cannot serialize the sweep
// (it sends no seq), so every load-mutate-save cycle for a game runs under
// withLock(gameId): callers chain on the previous holder's promise, giving
// strict FIFO execution per key. Assumes a single backend process (true for
// this compose stack).

const chains = new Map();

export function withLock(key, fn) {
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev.then(fn, fn); // run regardless of the predecessor's outcome
  // The stored chain link must never reject (only the caller-facing `next`
  // carries errors), or an unawaited link would raise unhandledRejection.
  const cleanup = next.then(() => {}, () => {}).then(() => {
    if (chains.get(key) === cleanup) chains.delete(key);
  });
  chains.set(key, cleanup);
  return next;
}
