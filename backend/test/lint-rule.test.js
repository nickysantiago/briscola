// Self-test for the async-callback rule in eslint.config.js. The rule is a set
// of AST selectors, and a selector that stops matching fails silently: lint
// would keep passing while checking nothing. Run with: node --test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const backendDir = fileURLToPath(new URL('..', import.meta.url));
const eslint = new ESLint({ cwd: backendDir });

// Lint a snippet as if it were a backend source file; return the rule's hits.
async function asyncCallbackErrors(code) {
  const [result] = await eslint.lintText(code, { filePath: `${backendDir}/snippet.js` });
  return result.messages.filter((m) => m.ruleId === 'no-restricted-syntax');
}

const flagged = {
  'payload destructured above the try (the playCard crash)': `
    export const bind = (socket, work) => socket.on('playCard', async (payload) => {
      const { gameId } = payload;
      try { await work(gameId); } catch (err) { console.error(err); }
    });`,
  'try/finally with no catch': `
    export const bind = (socket, work) => socket.on('x', async (payload) => {
      try { await work(payload); } finally { console.log('done'); }
    });`,
  'expression-bodied async arrow': `
    export const bind = (socket, work) => socket.once('x', async (payload) => work(payload));`,
  'async timer callback': `
    export const start = (work) => setInterval(async () => { await work(); }, 1000);`
};

for (const [name, code] of Object.entries(flagged)) {
  test(`lint flags an async callback: ${name}`, async () => {
    assert.equal((await asyncCallbackErrors(code)).length, 1);
  });
}

test('lint accepts an async callback whose whole body is in try/catch', async () => {
  const errors = await asyncCallbackErrors(`
    export const bind = (socket, work) => socket.on('x', async (payload) => {
      try {
        const { gameId } = payload;
        await work(gameId);
      } catch (err) {
        console.error(err);
      }
    });`);
  assert.deepEqual(errors, []);
});

test('lint leaves awaited async callbacks alone', async () => {
  const errors = await asyncCallbackErrors(`
    export const run = (withLock, work) => withLock('key', async () => { await work(); });`);
  assert.deepEqual(errors, []);
});
