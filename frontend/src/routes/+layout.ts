// Pure client-side app: prerender a static shell, never run on a server.
// The socket and localStorage are only touched from onMount.
export const prerender = true;
export const ssr = false;
