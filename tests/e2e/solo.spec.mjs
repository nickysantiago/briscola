// Solo E2E: a real browser playing against the AI. Runs on desktop Chromium and
// on WebKit with an iPhone viewport (see playwright.config.mjs).

import {
  test,
  expect,
  startSolo,
  playSoloTrick,
  playableCards,
  handLabels,
  readBoard,
  gameOverPanel,
  waitForLoaded,
  clickPulsing
} from './support.mjs';

test('a new game deals a playable board', async ({ page }) => {
  await startSolo(page, 'Normal');
  await expect(page.getByText('Your turn!')).toBeVisible();
  await expect(page.getByText('normal', { exact: true })).toBeVisible(); // difficulty chip
  await expect(page.getByText('AI cards 3')).toBeVisible();
  // The face-up trump sits under its "Trump" label, as an image (not playable).
  await expect(page.getByText('Trump', { exact: true }).locator('..').getByRole('img')).toHaveAttribute(
    'aria-label',
    / of (Oros|Copas|Espadas|Bastos)$/
  );
  expect(await readBoard(page)).toEqual({ deck: 33, me: 0, opp: 0 });
  await expect(page.getByRole('button', { name: 'New Game' })).toBeVisible();
});

test('clicking a card plays a full trick', async ({ page }) => {
  await startSolo(page);
  const { played, points } = await playSoloTrick(page, { by: 'click' });

  const board = await readBoard(page);
  expect(board.deck).toBe(31);
  expect(board.me + board.opp).toBe(points);
  expect(await handLabels(page)).toHaveLength(3);
  expect(await handLabels(page)).not.toContain(played);
});

test('dragging a card onto the table plays it', async ({ page }) => {
  await startSolo(page);
  const { played } = await playSoloTrick(page, { by: 'drag' });

  expect((await readBoard(page)).deck).toBe(31);
  expect(await handLabels(page)).not.toContain(played);
});

test('a refresh, and the home button, both resume the same game', async ({ page }) => {
  await startSolo(page);
  await playSoloTrick(page);
  await expect(playableCards(page).first()).toBeVisible();
  const board = await readBoard(page);
  const hand = await handLabels(page);

  await page.reload();
  await waitForLoaded(page);
  await expect(playableCards(page)).toHaveCount(3);
  expect(await readBoard(page)).toEqual(board);
  expect(await handLabels(page)).toEqual(hand);

  await page.getByRole('button', { name: 'Back to title screen' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to Brisca!' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume Game' }).click();
  await waitForLoaded(page);
  await expect(playableCards(page)).toHaveCount(3);
  expect(await readBoard(page)).toEqual(board);
  expect(await handLabels(page)).toEqual(hand);
});

test('a full game ends with a consistent result, then New Game starts fresh', async ({ page }) => {
  test.setTimeout(5 * 60_000); // 20 tricks of real animation

  await startSolo(page, 'Easy');
  let tricks = 0;
  while (!(await gameOverPanel(page).isVisible())) {
    await playSoloTrick(page);
    tricks++;
    expect(tricks, 'a 40-card game is 20 tricks').toBeLessThanOrEqual(20);
  }
  expect(tricks).toBe(20);

  const { me, opp, deck } = await readBoard(page);
  expect(deck).toBe(0);
  expect(me + opp).toBe(120);
  await expect(gameOverPanel(page)).toHaveText(`You ${me} — ${opp} AI`);
  const title = me > opp ? 'You win!' : me < opp ? 'AI wins' : "It's a tie!";
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('easy mode')).toBeVisible();

  await clickPulsing(page.getByRole('button', { name: 'New Game' })); // pulses at game over
  await page.getByRole('button', { name: /^Easy\b/ }).click();
  await expect(page.getByText('Deck 33')).toBeVisible();
  expect(await readBoard(page)).toEqual({ deck: 33, me: 0, opp: 0 });
});
