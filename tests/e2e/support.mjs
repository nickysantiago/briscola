// Shared E2E fixtures and board helpers. Everything is located the way a player
// (or a screen reader) finds it: by role, accessible name and visible text. The
// frontend needs no test-only attributes.

import { test as base, expect } from '@playwright/test';

export { expect };

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Collect uncaught page errors and console.error output; tests fail on any.
function watchErrors(page, label, sink) {
  page.on('pageerror', (err) => sink.push(`[${label}] uncaught: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') sink.push(`[${label}] console.error: ${msg.text()}`);
  });
}

export const test = base.extend({
  browserErrors: async ({}, use) => {
    const errors = [];
    await use(errors);
    expect(errors, 'browser errors during the test').toEqual([]);
  },

  // The default page, watched for errors.
  page: async ({ page, browserErrors }, use) => {
    watchErrors(page, 'page', browserErrors);
    await use(page);
  },

  // Extra players for multiplayer: `await players.open('host')` gives a page in
  // its own browser context (own localStorage = own seat token).
  players: async ({ browser, browserErrors }, use, testInfo) => {
    const contexts = [];
    const { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = testInfo.project.use;
    await use({
      async open(label) {
        const context = await browser.newContext({ baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });
        contexts.push(context);
        const page = await context.newPage();
        watchErrors(page, label, browserErrors);
        return page;
      }
    });
    for (const context of contexts) await context.close().catch(() => {});
  }
});

// ---------------------------------------------------------------------------
// Board reading
// ---------------------------------------------------------------------------

const CARD_NAME = /^(1|2|3|4|5|6|7|10|11|12) of (Oros|Copas|Espadas|Bastos)$/;

// Hand cards are buttons only while they can be played (my turn, nothing
// animating); otherwise they render as images. So this doubles as "my move".
export const playableCards = (page) => page.getByRole('button', { name: CARD_NAME });

// Every card in my hand, playable or not, by its "N of Suit" label.
export const handLabels = (page) =>
  page.locator('div[role="presentation"] > [aria-label]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));

export const trickBanner = (page) => page.getByText(/wins? the trick!/);
export const gameOverPanel = (page) => page.getByText(/^You \d+ — \d+ /);

const chipNumber = async (locator) => Number((await locator.first().innerText()).match(/(\d+)\s*$/)[1]);

// The info chips: deck count and both scores (seat-relative: "me" is this page).
export async function readBoard(page) {
  return {
    deck: await chipNumber(page.getByText(/Deck \d+/)),
    me: await chipNumber(page.locator('span').filter({ hasText: /^🙂/ })),
    opp: await chipNumber(page.locator('span').filter({ hasText: /^(🤖|🧑)/ }))
  };
}

// The loading overlay covers the whole page (and fades out over 300ms) while the
// board may already be rendered underneath; nothing is touchable until it's gone.
export async function waitForLoaded(page) {
  await expect(page.locator('#loading-screen')).toHaveCount(0);
}

// Click a button that pulses (e.g. "New Game" at game over): its animation means
// it is never "stable", so check what a user would see, then click through.
export async function clickPulsing(button) {
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click({ force: true });
}

// ---------------------------------------------------------------------------
// Solo flows
// ---------------------------------------------------------------------------

export async function startSolo(page, difficulty = 'Normal') {
  await page.goto('/');
  await waitForLoaded(page);
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.getByRole('heading', { name: 'Pick your challenge' })).toBeVisible();
  // The button's name also includes its hint ("Easy Random plays").
  await page.getByRole('button', { name: new RegExp(`^${difficulty}\\b`) }).click();
  await expect(page.getByText('Deck 33')).toBeVisible();
  await expect(playableCards(page)).toHaveCount(3);
  await waitForLoaded(page);
}

// Wait until a trick animation has fully played out on `page`: the banner came
// and went, and the board is back to "someone can move" or "game over".
// Returns the banner's text (who won, +points).
export async function waitForTrick(page, settledWhen = playableCards(page).first()) {
  const banner = trickBanner(page);
  await expect(banner).toBeVisible();
  const text = await banner.innerText();
  await expect(banner).toBeHidden();
  await expect(settledWhen.or(gameOverPanel(page))).toBeVisible();
  return text;
}

// Play my first playable card against the AI, by click or by drag-and-drop.
export async function playSoloTrick(page, { by = 'click' } = {}) {
  const card = playableCards(page).first();
  const played = await card.getAttribute('aria-label');
  if (by === 'drag') await dragToTable(page, card);
  else await card.click();
  const banner = await waitForTrick(page);
  return { played, points: Number(banner.match(/\+(\d+)/)[1]) };
}

export async function dragToTable(page, card) {
  // hover() waits until the card itself would receive the pointer (no overlay on
  // top), unlike raw mouse moves; the press then starts from there.
  await card.hover();
  await page.mouse.down();
  const to = await page.locator('#play-area').boundingBox();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await expect(page.getByText('Play here')).toBeVisible(); // drop target while dragging
  await page.mouse.up();
}

// ---------------------------------------------------------------------------
// Multiplayer flows
// ---------------------------------------------------------------------------

export const playerName = (role) => `e2e-${role}-${Math.random().toString(36).slice(2, 6)}`;

// Host creates a room through the UI; resolves with the room code.
export async function hostRoom(page, name) {
  await page.goto('/');
  await waitForLoaded(page);
  await page.getByRole('button', { name: 'Multi Player' }).click();
  await page.getByRole('button', { name: /^Start Multiplayer Game/ }).click();
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Create Room' }).click();
  await expect(page.getByRole('heading', { name: 'Your room is ready!' })).toBeVisible();
  await waitForLoaded(page);
  const code = page.getByText(/^\d{4}$/);
  await expect(code).toBeVisible();
  return code.innerText();
}

export async function openJoinForm(page) {
  await page.goto('/');
  await waitForLoaded(page);
  await page.getByRole('button', { name: 'Multi Player' }).click();
  await page.getByRole('button', { name: /^Join Multiplayer Game/ }).click();
}

export async function joinRoom(page, code, name) {
  await openJoinForm(page);
  await page.getByLabel('Room code').fill(code);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join Game' }).click();
}

// Two players in two browser contexts, seated and looking at the first deal.
export async function startMatch(players) {
  const host = await players.open('host');
  const guest = await players.open('guest');
  const hostName = playerName('host');
  const guestName = playerName('guest');
  const code = await hostRoom(host, hostName);
  await joinRoom(guest, code, guestName);
  await expect(host.getByText('Your turn!')).toBeVisible();
  await expect(guest.getByText(`${hostName}'s turn…`)).toBeVisible();
  await Promise.all([waitForLoaded(host), waitForLoaded(guest)]);
  return { host, guest, hostName, guestName, code };
}

// One full trick: `leader` plays, `follower` answers. Resolves with the page
// that won (and so leads next) once both boards have settled.
export async function playMpTrick(leader, follower) {
  await playableCards(leader).first().click();
  await expect(playableCards(follower).first()).toBeVisible(); // the lead reached the follower
  await playableCards(follower).first().click();

  const [leaderBanner] = await Promise.all([
    waitForTrick(leader, leader.getByText(/Your turn!|'s turn…/)),
    waitForTrick(follower, follower.getByText(/Your turn!|'s turn…/))
  ]);
  const winner = leaderBanner.startsWith('You win') ? leader : follower;
  await expect(playableCards(winner).first().or(gameOverPanel(winner))).toBeVisible();
  return winner;
}
