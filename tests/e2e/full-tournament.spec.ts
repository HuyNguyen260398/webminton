import { expect, test } from '@playwright/test';

test('mọi route tĩnh refresh được và public payload giữ dữ liệu riêng tư', async ({ page, request }) => {
  for (const path of ['/', '/van-dong-vien/', '/boc-tham/', '/lich-thi-dau/', '/thu-chi/', '/quan-tri/']) {
    await page.goto(path);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  }
  const response = await request.get('/api/public/tournament');
  const body = await response.text();
  expect(response.ok()).toBeTruthy();
  expect(body).not.toContain('phone');
  expect(body).not.toContain('feePayments');
});
