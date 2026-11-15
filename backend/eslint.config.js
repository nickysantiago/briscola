// eslint.config.js - lint rules for the backend (`npm run lint`, the Jenkins
// "Lint Backend" stage).

import js from '@eslint/js';
import globals from 'globals';

// An async function handed to an API that ignores its return value (an event
// emitter's .on(), a timer) has nobody awaiting it, so anything it throws
// outside a try/catch becomes an unhandled rejection - and Node exits on those.
// That is how `socket.emit('playCard', null)` once took the whole server down:
// the handler destructured its payload one line above its try.
//
// The selectors below require such a callback's body to sit entirely inside
// try/catch. They are syntactic, so they only see an async function written
// inline at the call site. They do NOT see a handler passed by name
// (`socket.on('x', onX)`), one returned by a factory (`createHttpHandler`), or
// a sync arrow that returns a promise (`(p) => handle(p)`): route those through
// a wrapper like guarded() in multiplayer.js. The type-aware alternative,
// @typescript-eslint/no-misused-promises, was tried and does not flag
// Socket.io listeners at all (their `on()` listener type is a generic
// conditional it cannot resolve), so it would have missed the original bug.
const DROPS_PROMISE_NAMES =
  '/^(on|once|addListener|prependListener|prependOnceListener|' +
  'setTimeout|setInterval|setImmediate|queueMicrotask|nextTick)$/';
const ASYNC_CALLBACK =
  `CallExpression:matches([callee.name=${DROPS_PROMISE_NAMES}], ` +
  `[callee.property.name=${DROPS_PROMISE_NAMES}]) > :function[async=true].arguments`;
const WHY = 'nothing awaits an async event/timer callback, so a throw here is an ' +
  'unhandled rejection that crashes the process.';

export default [
  { ignores: ['coverage/'] },

  js.configs.recommended,

  {
    languageOptions: { globals: globals.node },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: `${ASYNC_CALLBACK} > BlockStatement > :not(TryStatement)`,
          message: `Statement outside try/catch: ${WHY} Move it inside the try.`
        },
        {
          selector: `${ASYNC_CALLBACK} > BlockStatement > TryStatement:not([handler])`,
          message: `try without catch: ${WHY} Add a catch.`
        },
        {
          selector: `${ASYNC_CALLBACK} > :not(BlockStatement).body`,
          message: `Expression-bodied async callback: ${WHY} Use a block body with try/catch.`
        }
      ]
    }
  },

  {
    // ai.js is pinned byte-for-byte by the golden-master test, so its one
    // finding (an unused `playerCard` parameter kept for a uniform strategy
    // signature) is switched off here instead of being edited away.
    files: ['game/ai.js'],
    rules: { 'no-unused-vars': 'off' }
  }
];
