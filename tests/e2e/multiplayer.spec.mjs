// Multiplayer E2E: two (or three) separate browser contexts playing each other
// through the real UI. Desktop Chromium only (see playwright.config.mjs).

import {
  test,
  expect,
  startMatch,
  startSolo,
  playMpTrick,
  playableCards,
  handLabels,
  readBoard,
  gameOverPanel,
  openJoinForm,
  waitForLoaded,
  playerName
} from './support.mjs';
import { startMatch as startProtocolMatch } from '../lib/client.mjs';

test('host and guest meet through a room code and each see their own board', async ({ players }) => {
  const { host, guest, hostName, guestName } = await startMatch(players);

  for (const [page, me, them] of [[host, hostName, guestName], [guest, guestName, hostName]]) {
    expect(await readBoard(page)).toEqual({ deck: 33, me: 0, opp: 0 });
    await expect(page.locator('span').filter({ hasText: new RegExp(`^🙂 ${me}`) })).toBeVisible();
    await expect(page.getByText(`${them}'s cards 3`)).toBeVisible();
    await expect(page.getByText('Multiplayer', { exact: true })).toBeVisible();
  }
  await expect(playableCards(host)).toHaveCount(3);
  await expect(playableCards(guest)).toHaveCount(0); // not their turn: cards are images

  const [hostHand, guestHand] = [await handLabels(host), await handLabels(guest)];
  expect(guestHand).toHaveLength(3);
  expect(hostHand.filter((c) => guestHand.includes(c)), 'hands overlap').toEqual([]);
});

test('a trick played from both browsers updates both boards, mirrored', async ({ players }) => {
  const { host, guest } = await startMatch(players);
  const winner = await playMpTrick(host, guest);

  const [a, b] = [await readBoard(host), await readBoard(guest)];
  expect(a.deck).toBe(31);
  expect(b.deck).toBe(31);
  expect([a.me, a.opp]).toEqual([b.opp, b.me]);
  await expect(winner.getByText('Your turn!')).toBeVisible();
});

test('a reload mid-game puts the player back in their seat', async ({ players }) => {
  const { host, guest } = await startMatch(players);
  let leader = await playMpTrick(host, guest);
  const before = await readBoard(guest);
  const hand = await handLabels(guest);

  await guest.reload();
  await waitForLoaded(guest);
  await expect(guest.getByText('Multiplayer', { exact: true })).toBeVisible();
  expect(await readBoard(guest)).toEqual(before);
  expect(await handLabels(guest)).toEqual(hand);

  // The game carries on from the reloaded page.
  leader = await playMpTrick(leader, leader === host ? guest : host);
  expect((await readBoard(guest)).deck).toBe(29);
});

test('an opponent who leaves is reported, and the host can end the game', async ({ players }) => {
  const { host, guest, guestName } = await startMatch(players);
  await guest.close();

  // The server waits out an ~8s grace period before reporting the drop.
  await expect(host.getByRole('heading', { name: `${guestName} disconnected` })).toBeVisible({ timeout: 20_000 });
  await host.getByRole('button', { name: 'End Game' }).click();
  await expect(host.getByRole('heading', { name: 'Game ended' })).toBeVisible();
  await expect(host.getByText('You ended the game. No winner was recorded.')).toBeVisible();
  await host.getByRole('button', { name: 'Back to menu' }).click();
  await expect(host.getByRole('heading', { name: 'Welcome to Brisca!' })).toBeVisible();
});

test('the join form validates the code and shows the server\'s "room full" error', async ({ page }) => {
  // Fill a room over the protocol (fast), then try to join it as a third player.
  const seated = await startProtocolMatch();
  try {
    await openJoinForm(page);
    const join = page.getByRole('button', { name: 'Join Game' });
    await page.getByLabel('Your name').fill(playerName('third'));
    await page.getByLabel('Room code').fill('12');
    await expect(join).toBeDisabled();
    await page.getByLabel('Room code').fill(seated.code);
    await expect(join).toBeEnabled();
    await join.click();
    await expect(page.getByText('That room already has two players.')).toBeVisible();
    await waitForLoaded(page);
    await expect(page.getByRole('heading', { name: 'Join a game' })).toBeVisible();
  } finally {
    seated.host.close();
    seated.guest.close();
  }
});

test('after a full game, a rematch request reaches the other side, and leaving frees the player for solo', async ({ players }) => {
  test.setTimeout(6 * 60_000); // 20 tricks of real animation, two browsers
  const { host, guest, hostName, guestName } = await startMatch(players);

  let leader = host;
  for (let trick = 1; !(await gameOverPanel(host).isVisible()); trick++) {
    expect(trick, 'a 40-card game is 20 tricks').toBeLessThanOrEqual(20);
    leader = await playMpTrick(leader, leader === host ? guest : host);
  }

  const [a, b] = [await readBoard(host), await readBoard(guest)];
  expect(a.me + a.opp).toBe(120);
  await expect(gameOverPanel(host)).toHaveText(`You ${a.me} — ${a.opp} ${guestName}`);
  await expect(gameOverPanel(guest)).toHaveText(`You ${b.me} — ${b.opp} ${hostName}`);

  // Host asks for a rematch; the guest sees the request.
  await host.getByRole('button', { name: 'Play Again' }).click();
  await expect(host.getByText(`Waiting for ${guestName}…`)).toBeVisible();
  await expect(guest.getByText(`${hostName} wants a rematch!`)).toBeVisible();

  // The guest declines by leaving. Their finished seat must not hijack the next
  // boot (regression: abea7ee): a fresh solo game, then a reload, stays solo.
  await guest.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(guest.getByRole('heading', { name: 'Welcome to Brisca!' })).toBeVisible();
  await startSolo(guest);
  await guest.reload();
  await waitForLoaded(guest);
  await expect(guest.getByText('normal', { exact: true })).toBeVisible();
  await expect(guest.getByText('AI cards 3')).toBeVisible();
  await expect(guest.getByText('Multiplayer', { exact: true })).toHaveCount(0);
});
