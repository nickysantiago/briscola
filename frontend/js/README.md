Front-end modules (UI only — all game logic/AI/state now live in the backend).

controller.js: Entry point. Wires input + Socket.io events to the renderer/animations.
net.js: Socket.io bootstrap and emit helpers (newGame / playCard / resume).
client-state.js: Client-side mirror of the server's public game snapshot (+ localStorage gameId).
ui-renderer.js: All DOM rendering, driven by client-state.
animations.js: Card-movement animation engine, driven by server `trickResolved` outcomes.
constants.js: Client-side constants (animation timing).

The game engine, rules, and AI were moved to backend/game/ (constants.js, engine.js, ai.js)
and the Socket.io/Redis server is backend/server.js.
