// payload.js - normalizing untrusted Socket.io payloads.

// Client payloads are untrusted: a `null` or primitive would throw on property
// access, and a throw outside a handler's try is an unhandled rejection that
// takes the whole process down. Anything that isn't an object reads as {}.
export function asObject(payload) {
  return payload !== null && typeof payload === 'object' ? payload : {};
}
