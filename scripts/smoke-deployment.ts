export {};
const base = (process.argv[2] ?? '').replace(/\/$/, '');
if (!base) throw new Error('SITE_URL is required');
for (const path of ['/', '/van-dong-vien/', '/boc-tham/', '/lich-thi-dau/', '/thu-chi/']) {
  const response = await fetch(`${base}${path}`);
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
}
const publicResponse = await fetch(`${base}/api/public/tournament`);
if (!publicResponse.ok || !(await publicResponse.headers.get('content-type') ?? '').includes('application/json')) throw new Error('Public API smoke failed');
const unauthorized = await fetch(`${base}/api/admin/tournament`);
if (![401, 403].includes(unauthorized.status)) throw new Error(`Admin API returned ${unauthorized.status} without credentials`);
console.log(`Smoke passed for ${base}`);
