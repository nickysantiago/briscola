// net.js - Socket.io bootstrap + thin emit helpers.
//
// The socket.io client (window.io) is loaded by a <script> tag in index.html from
// /socket.io/socket.io.js, which nginx reverse-proxies to the backend. Because the
// page and the socket share one origin, no CORS is involved. io() with no URL
// connects back to window.location.origin over /socket.io (polling, upgrading to
// WebSocket) — both are proxied by the nginx /socket.io/ location.

/* global io */
const socket = io();

function emitNewGame(difficulty) {
  socket.emit('newGame', { difficulty });
}

function emitPlayCard(gameId, index, seq) {
  socket.emit('playCard', { gameId, index, seq });
}

function emitResume(gameId) {
  socket.emit('resume', { gameId });
}

export { socket, emitNewGame, emitPlayCard, emitResume };
