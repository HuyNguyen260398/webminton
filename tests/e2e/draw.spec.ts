import { expect, test } from '@playwright/test';

test('refresh đường dẫn lịch vẫn mở đúng trang', async ({ page }) => {
  await page.goto('/lich-thi-dau/');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Lịch thi đấu' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Bảng xếp hạng' })).toBeVisible();
});

test('trang bốc thăm giải thích điều kiện khi chưa đủ danh sách', async ({ page }) => {
  await page.goto('/boc-tham/');
  await expect(page.getByRole('heading', { name: 'Bốc thăm chia đội' })).toBeVisible();
  await expect(page.getByText(/cần tối thiểu 8 nam và 8 nữ/i)).toBeVisible();
});

test('BTC bốc thăm 24 VĐV và xác nhận tạo 18 trận vòng bảng', async ({ request }) => {
  const headers = { Authorization: 'Bearer local-test-token' };
  const before = await request.get('/api/admin/tournament', { headers });
  let etag = before.headers()['etag'];
  const athletes = Array.from({ length: 24 }, (_, index) => ({
    id: `athlete-${index + 1}`,
    name: `VĐV ${index + 1}`,
    gender: index < 12 ? 'male' : 'female',
    skillBand: (index % 3) + 1,
    teamId: null,
    phone: null,
    note: '',
    active: true,
  }));
  const command = async (type: string, payload: unknown) => {
    const response = await request.post('/api/admin/commands', {
      headers: { ...headers, 'If-Match': etag },
      data: { requestId: `draw-${type}`, type, payload },
    });
    expect(response.ok()).toBeTruthy();
    etag = response.headers()['etag'];
    return response.json();
  };
  await command('replaceRoster', { athletes });
  const draft = await command('generateDraw', {});
  expect(draft.document.draw.status).toBe('draft');
  const confirmed = await command('confirmDraw', { rosterHash: draft.document.draw.rosterHash });
  expect(confirmed.document.matches).toHaveLength(18);
  expect(new Set(confirmed.document.athletes.map((athlete: { teamId: string }) => athlete.teamId)).size).toBe(4);
});
