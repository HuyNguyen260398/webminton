import { expect, test } from '@playwright/test';

test('tài chính chưa công bố không lộ khoản thu chi', async ({ page, request }) => {
  const tournament = await (await request.get('/api/public/tournament')).json();
  expect(tournament.finance).toEqual({ published: false });
  await page.goto('/thu-chi/');
  await expect(page.getByRole('heading', { name: 'Thu chi giải đấu' })).toBeVisible();
  await expect(page.getByText('Chưa công bố thu chi.')).toBeVisible();
});
