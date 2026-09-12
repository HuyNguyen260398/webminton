# Webminton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Subagent-driven development is optional if Huy explicitly selects it.

**Goal:** Xây dựng ứng dụng tiếng Việt điều hành giải cầu lông CN1416 từ poster/Excel, lưu trạng thái giải trong S3 JSON và triển khai bằng Terraform/GitHub Actions.

**Architecture:** Next.js static export qua CloudFront/S3 site. API Gateway REST + Cognito bảo vệ Lambda TypeScript; Lambda đọc/ghi một S3 JSON private bằng ETag conditional writes. Domain engine xử lý luật giải, bốc thăm, lịch và tài chính độc lập với AWS/UI.

**Tech Stack:** TypeScript, Node.js 24, Next.js App Router, React, CSS, Zod, AWS SDK v3, Vitest, Testing Library, Playwright, pnpm workspace, Terraform >=1.10,<2, GitHub Actions OIDC.

**Spec:** [2026-09-12-webminton-design.md](../specs/2026-09-12-webminton-design.md)

## Global Constraints

- Toàn bộ nội dung, validation, lỗi, trạng thái rỗng, accessibility label và ngày tiền của ứng dụng bằng tiếng Việt.
- `lang=vi`, locale `vi-VN`, timezone `Asia/Ho_Chi_Minh`, tiền integer VND.
- MVP một giải đang hoạt động, định danh `noi-bo-2026`, không làm nền tảng nhiều CLB.
- Giới hạn tài liệu 1 MiB, request 256 KiB, cảnh báo khi gần giới hạn; không lưu ảnh/base64 trong JSON.
- Không nhập công thức Excel làm logic ứng dụng.
- Không tự suy ra ngày, lệ phí, số sân, trình độ VĐV, số điện thoại BTC, danh sách thật.
- Terraform không quản lý nội dung tournament.json; workflow thường không seed/reset data.
- Fork PR không có AWS/OIDC/secrets.
- Huy đã yêu cầu thực thi kế hoạch; sáu quyết định sản phẩm đã được Huy xác nhận tại spec §7.

## Cách thực hiện

**Bắt buộc commit theo task:** Mỗi task hoàn thành phải có một commit riêng ngay sau khi các kiểm tra của task đạt yêu cầu, trước khi chuyển sang task tiếp theo. Không gộp nhiều task vào một commit hoặc đợi hết mốc mới commit. Chỉ đánh dấu task hoàn tất sau khi commit thành công; báo cáo SHA commit cùng kết quả kiểm tra. Nếu kiểm tra hoặc commit bị chặn, giữ task chưa hoàn tất và nêu rõ nguyên nhân.

Trước mỗi commit, chạy `git status --short`, review diff, stage bằng đường dẫn cụ thể chỉ các file thuộc task (kèm cập nhật checklist liên quan), rồi chạy `git diff --cached --check` và review `git diff --cached`. Dùng commit message ghi ở cuối từng task. Sau commit, chạy `git log -1 --format="%h %s"` và `git status --short` để xác nhận commit và các thay đổi còn lại. Không tự push trong bước commit này.

Đọc spec trước mỗi task. Mỗi task là một phần có thể kiểm thử và review riêng; thứ tự bên dưới thể hiện phụ thuộc. Viết test hành vi trước, chạy đỏ, viết từng file tối thiểu, chạy xanh rồi commit đúng file của task. Không commit assets/điện thoại/state theo wildcard. Các đoạn code dưới là hợp đồng và test mẫu cho kế hoạch, không phải mã ứng dụng đã được chạy. Không cần commit tài liệu ngay trong phiên lập kế hoạch.

Chia 4 mốc: M1 domain/API dùng local fixture (Tasks 1–7); M2 giao diện đầy đủ (8–11); M3 AWS dev và CI/CD (12–14); M4 diễn tập/nghiệm thu (15). Các mốc đều thuộc cùng một ứng dụng, dùng chung schema; không tách thành dịch vụ triển khai riêng.

## Cấu trúc file dự kiến

```text
frontend/src/app/{page.tsx,layout.tsx,globals.css}
frontend/src/app/{van-dong-vien,boc-tham,lich-thi-dau,thu-chi,quan-tri}/page.tsx
frontend/src/features/{landing,athletes,draw,matches,finance,admin}/
frontend/src/lib/{api,auth,format}.ts
frontend/public/posters/                    # bản copy có chủ đích của poster
backend/src/{handler,router,auth,errors}.ts
backend/src/storage/{repository,s3-repository,memory-repository}.ts
backend/src/commands/{dispatch,athletes,draw,matches,finance,settings,restore}.ts
backend/src/projections/public-tournament.ts
backend/test/                              # unit/API tests; AWS tests ở integration/
packages/domain/src/{schema,commands,score,round-robin,standings,advancement,draw,schedule,finance,derive}.ts
packages/domain/test/                      # domain tests theo module
packages/domain/src/testing/fixtures.ts    # synthetic data, không publish bundle public
scripts/{roster-config,seed-tournament,serve-local-api,smoke-deployment}.ts
data/tournament.seed.json                  # sạch, không PII/dữ liệu ví dụ
tests/e2e/                                # dùng bản static export và local API thật
infra/bootstrap/{main,variables,outputs}.tf
infra/modules/{data,auth,compute,api,frontend,observability}/{main,variables,outputs}.tf
infra/modules/frontend/route-rewrite.js
infra/envs/{dev,prod}/{main,variables,outputs,backend}.tf
.github/workflows/{quality,deploy,plan}.yml
docs/runbooks/{bootstrap,operations,rollback}.md
```

Không dùng import trực tiếp file ngoài workspace. Đối chiếu mẫu bằng đọc source và chuyển các module cần thiết với thay đổi rõ ở spec §2/§6.

### Task 1: Schema, toolchain và dữ liệu khởi tạo sạch

**Files:** Create root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.nvmrc`, `.gitignore`; `packages/domain/{package.json,tsconfig.json}`; `packages/domain/src/{schema,commands}.ts`; `packages/domain/src/testing/fixtures.ts`; `packages/domain/test/schema.test.ts`; `data/tournament.seed.json`.

**Interfaces:** Produces Zod `TournamentSchema`, type `TournamentDocument` từ spec §4; `CommandSchema`, discriminated union `TournamentCommand`; test helpers `makeTournament(): TournamentDocument`, `makeRoster(count: number): Athlete[]`, `makeCompletedGroup(): TournamentDocument`. `makeRoster(24)` sinh 12 nam/12 nữ, trình độ luân phiên 1/2/3, ID ổn định, hoàn toàn giả. `makeCompletedGroup` dùng 18 điểm hợp lệ, tạo thứ hạng không hòa, sẽ sử dụng round-robin/derive từ Tasks 2–3 khi các module đó tồn tại.

- [x] Kiểm tra Node/Next/pnpm/provider tương thích tại thời điểm chạy; khóa bản cụ thể trong packageManager, .nvmrc, lockfile; bật strict TS. Root scripts `lint`, `typecheck`, `test`, `build`, `test:e2e`; domain `test` chạy `vitest run`.
- [x] Viết `schema.test.ts` với test seed sạch và invalid references:

```ts
import { expect, test } from 'vitest';
import { TournamentSchema } from '../src/schema';
import { makeTournament } from '../src/testing/fixtures';
test('seed chưa có người đăng ký hoặc kết quả giả', () => {
  const t = TournamentSchema.parse(makeTournament());
  expect(t.athletes).toEqual([]);
  expect(t.matches.every(m => m.score === null)).toBe(true);
  expect(t.info.feeVnd).toBeNull();
  expect(t.results.champion).toBeNull();
});
test('không nhận revision âm', () => {
  expect(() => TournamentSchema.parse({...makeTournament(), revision: -1})).toThrow();
});
```

- [x] Chạy `pnpm --filter @webminton/domain test`; xác nhận đỏ do schema/helper chưa có.
- [x] Viết schema theo spec §4, `.strict()` trên inputs, validate ID duy nhất và tham chiếu. Seed có 4 đội, null ngày/phí, athletes=[], khoản BTC cam kết 1.000.000đ chưa nhận. Types suy ra từ schema; không nhân đôi interface ở frontend/backend.
- [x] Chạy test và typecheck; kiểm tra seed không có “Nguyễn Văn Ví Dụ”, điện thoại ví dụ hoặc tỉ số mẫu.
- [x] Commit riêng cho task: `feat: define tournament schema and clean seed`.

### Task 2: Luật điểm và vòng tròn 18 trận

**Files:** Create `packages/domain/src/{score,round-robin}.ts`, `packages/domain/test/{score,round-robin}.test.ts`.

**Interfaces:** `isFinalScore(score: Score): boolean`; `generateGroupMatches(teams: Team[], categories: Category[]): Match[]`. ID deterministic `group-{teamAId}-{teamBId}-{category}`, order 1–18; score/pairs null, pending. Consumes schema.

- [x] Viết các test bao gồm đảo chiều điểm và 6 cặp đội:

```ts
test.each([[21,0],[21,19],[22,20],[24,22],[25,23],[25,24]])(
  'nhận %i–%i', (a,b) => {
    expect(isFinalScore({a,b})).toBe(true);
    expect(isFinalScore({a:b,b:a})).toBe(true);
  });
test.each([[0,0],[21,20],[22,19],[25,22],[26,24],[-1,21],[21,1.5]])(
  'từ chối %i–%i', (a,b) => expect(isFinalScore({a,b})).toBe(false));
test('4 đội có 18 trận, mỗi đội 9 trận', () => {
  const t = makeTournament();
  const matches = generateGroupMatches(t.teams,t.rules.categories);
  expect(matches).toHaveLength(18);
  for (const team of t.teams)
    expect(matches.filter(m => [m.teamAId,m.teamBId].includes(team.id))).toHaveLength(9);
  expect(new Set(matches.map(m => m.id)).size).toBe(18);
});
```

- [x] Chạy `pnpm --filter @webminton/domain test score round-robin`, xác nhận đỏ.
- [x] Implement công thức spec §5 và nested pairs `i<j`, không hardcode tên đội; từ chối config ngoài thể thức MVP.
- [x] Thêm type command `setWalkover` có matchId, absentSide ('a'|'b'), reason; test server đặt 0–21 khi A vắng và 21–0 khi B vắng, status=walkover. Task 3 tính walkover vào pointsFor/wins/advancement, Task 7 lưu command, Task 10 có thao tác admin “Xử thua do vắng mặt”. Nếu hai bên vắng thì chờ BTC, không tự chọn winner.
- [x] Chạy lại tests.
- [x] Commit riêng cho task: `feat: implement 21-25 scoring and round robin`.

### Task 3: BXH, tranh hạng và sửa kết quả phụ thuộc

**Files:** Create `packages/domain/src/{standings,advancement,derive}.ts`, `packages/domain/test/{standings,advancement}.test.ts`; complete `testing/fixtures.ts`.

**Interfaces:** `deriveTournament(t: TournamentDocument): TournamentDocument`; `calculateStandings(t): TournamentDocument['results']['standings']`; `seedPlacement(t): TournamentDocument`; `applyScore(t, matchId: string, score: Score): TournamentDocument`. Invalid score throws `INVALID_SCORE`; reseed locked throws `PLACEMENT_RESET_REQUIRED`. Shared domain errors use code/messageVi, mapped in Task 7.

- [x] Viết tests: pointsFor ưu tiên hơn wins; hòa hoàn toàn rank=null; chưa đủ 18 không seed; completedGroup tạo 6 trận, first_place lấy rank1/2. Test sửa điểm sau khi một trận placement called:

```ts
test('không âm thầm thay đội sau khi gọi tranh hạng', () => {
  const t = seedPlacement(makeCompletedGroup());
  t.matches.find(m => m.phase === 'first_place')!.status = 'called';
  // Chọn trận giữa hạng 1 và hạng 4, đổi thắng/thua để fixture đổi seed.
  const ranks = calculateStandings(t);
  const ids = [ranks.find(r => r.rank === 1)!.teamId,
               ranks.find(r => r.rank === 4)!.teamId];
  const m = t.matches.find(m => m.phase === 'group' &&
    ids.includes(m.teamAId!) && ids.includes(m.teamBId!))!;
  expect(() => applyScore(t,m.id,{a:m.score!.b,b:m.score!.a}))
    .toThrow('PLACEMENT_RESET_REQUIRED');
});
```

- [x] Chạy tests đỏ, đảm bảo fixture thật sự đổi seed bằng assertion thứ hạng trước/sau trong test riêng.
- [x] Implement comparator từng tiêu chí và tied groups; tie decision chỉ nhận cùng kết quả hash. Tạo matches placement theo ID `first_place-{category}`/`third_place-{category}`. Derive winner cho score hợp lệ, awards sau thắng 2/3, finalized sau đủ 24.
- [x] Thêm test thắng hai nội dung vẫn giữ trận thứ ba; resetPlacement xóa score/công bố của 6 trận và lưu audit tại command layer; category winners trả mảng khi hòa. Chạy tests xanh.
- [x] Commit riêng cho task: `feat: derive standings and placement results`.

### Task 4: Bốc thăm có ràng buộc và có thể tiếp tục

**Files:** Create `packages/domain/src/draw.ts`, `packages/domain/test/draw.test.ts`.

**Interfaces:** `generateDraw(t: TournamentDocument, seed: string): TournamentDocument['draw']`; `confirmDraw(t, rosterHash: string): TournamentDocument`. Seed do backend sinh, helper này pure. Hash gồm active IDs, gender, skillBand; thuật toán `balanced-v1` theo spec §5.

- [x] Test một seed cho cùng kết quả, không trùng/mất IDs, đội >=2 nữ/2 nam, chênh size<=1, thiếu skill báo lỗi, 7 nữ báo không đủ, roster đổi không confirm:

```ts
test('seed cố định bảo toàn roster', () => {
  const t = makeTournament(); t.athletes = makeRoster(24);
  const a = generateDraw(t,'seed-1');
  expect(a).toEqual(generateDraw(t,'seed-1'));
  expect(Object.keys(a.assignment).sort()).toEqual(t.athletes.map(x=>x.id).sort());
  const sizes = t.teams.map(team=>Object.values(a.assignment).filter(id=>id===team.id).length);
  expect(Math.max(...sizes)-Math.min(...sizes)).toBeLessThanOrEqual(1);
});
```

- [x] Chạy đỏ; viết seeded PRNG/shuffle và allocator theo spec, giới hạn 100 attempts; lưu algorithmVersion/seed/rosterHash/assignment. Không dùng frontend Math.random làm kết quả authoritative.
- [x] Chạy test nhiều roster 16/17/23/24 người khả thi và 100 seed, kiểm tra invariant, không test xác suất từng người bằng tỷ lệ tùy tiện.
- [x] Commit riêng cho task: `feat: add constrained reproducible team draw`.

### Task 5: Cặp đấu và lịch sân

**Files:** Create `packages/domain/src/schedule.ts`, `packages/domain/test/schedule.test.ts`.

**Interfaces:** `validateLineup(t, match: Match): void`; `findScheduleConflicts(matches: Match[]): Array<{matchIds:[string,string]; reason:'court'|'athlete'}>`; `reorderMatches(matches: Match[], orderedIds: string[]): Match[]`.

- [x] Test duplicate athlete, wrong team/gender, trùng sân hoặc người khi khoảng giờ giao nhau; mốc kết thúc bằng bắt đầu không trùng. Test reordering không sửa ID/score:

```ts
test('đổi thứ tự giữ nguyên điểm và ID', () => {
  const t = makeCompletedGroup();
  const ids = t.matches.map(m=>m.id).reverse();
  const out = reorderMatches(t.matches,ids);
  expect(out.map(m=>m.id)).toEqual(ids);
  for (const m of out) expect(m.score).toEqual(t.matches.find(x=>x.id===m.id)!.score);
});
```

- [x] Chạy đỏ; implement interval overlap `a.start<b.end && b.start<a.end`, bỏ qua trận chưa có giờ, yêu cầu cả startsAt/endsAt cùng có hoặc cùng null. Giữ constraints khi upsert lineup hoặc schedule.
- [x] Chạy xanh.
- [x] Commit riêng cho task: `feat: validate lineups and court scheduling`.

### Task 6: Tài chính và quản lý roster bằng JSON thủ công

**Files:** Create `packages/domain/src/finance.ts`, `packages/domain/test/finance.test.ts`, `scripts/roster-config.ts`, `scripts/test/roster-config.test.ts`, `docs/runbooks/roster-config.md`.

**Interfaces:** `calculateFinance(t): {receivedVnd:number; paidVnd:number; balanceVnd:number; budgetExpenseVnd:number; additionalPerAthleteVnd:number|null}`; `rankSponsors(t): Array<{id:string;tier:'diamond'|'gold'|'friendly'}>`; `parseRosterConfig(input: unknown): {etag:string;athletes:Athlete[]}`. CLI `roster-config export|validate|diff|apply --file <private-path>`; export đọc admin API, apply gửi command `replaceRoster` cùng ETag gốc và requestId. API client hoàn thiện ở Task 7; Task 6 kiểm parser/diff bằng fake transport.

- [x] Test totals không double count, cam kết khác cash, 0 VĐV trả null, thiếu 10.001đ/3 người cần 4.000đ/người. Hai tài trợ cùng top nhận Kim cương, mức khác kế tiếp nhận Vàng.
- [x] Viết test parser bảo toàn ID và từ chối trùng ID:

```ts
test('JSON roster không nhận ID trùng', () => {
  const athletes = makeRoster(16);
  expect(() => parseRosterConfig({etag:'"v1"',athletes:[athletes[0],athletes[0]]}))
    .toThrow();
});
```

- [x] Chạy `pnpm exec vitest run packages/domain/test/finance.test.ts scripts/test/roster-config.test.ts` đỏ.
- [x] Implement tài chính theo spec §5; parser strict, stable IDs, preview thêm/sửa/xóa. CLI giữ ETag gốc, không tự retry conflict bằng ETag mới. Không lưu roster thật chứa điện thoại vào Git, seed vẫn sạch. Excel chỉ làm tham chiếu, không xây importer.
- [x] Test apply qua fake transport gửi đúng roster/ETag/requestId, không gửi điểm hoặc tài chính; viết hướng dẫn export → sửa JSON thủ công → validate → diff → apply. Chạy xanh.
- [x] Commit riêng cho task: `feat: add finance calculations and manual JSON roster workflow`.

### Task 7: Repository S3, auth, API commands và projection

**Files:** Create backend package/tsconfig; all `backend/src` files listed in tree; tests `backend/test/{repository,auth,commands,projection,restore}.test.ts`; `scripts/{serve-local-api,seed-tournament}.ts`.

**Interfaces:** `TournamentRepository.read(): Promise<{document:TournamentDocument;etag:string}>`; `write(document,expectedEtag): Promise<{etag:string}>`; `listVersions(cursor?): Promise<{items:Array<{versionId:string;lastModified:string}>;nextCursor?:string}>`; `readVersion(versionId): Promise<TournamentDocument>`; `create(document): Promise<void>`. `executeCommand(repository, command:TournamentCommand, context:{actorSub:string;etag:string}): Promise<{document:TournamentDocument;etag:string;replayed:boolean}>`. `toPublicTournament(t)` trả allowlist từ spec §3. `handler(event)` dùng REST API proxy event. MemoryRepository mô phỏng CAS/versions, chỉ dùng local/test.

- [x] Viết integration ở command layer: hai request đọc cùng ETag, chỉ một thành công; requestId replay không tăng revision/phí; giả group admin trong request body bị bỏ; projection không có phone/note/feePayments/pairs bí mật; public mutation 403/401.

```ts
test('ETag cũ không ghi đè bản mới', async () => {
  const repo = new MemoryRepository(makeTournament());
  const old = await repo.read();
  await repo.write({...old.document,revision:1},old.etag);
  await expect(repo.write({...old.document,revision:2},old.etag))
    .rejects.toThrow('CONFLICT');
  expect((await repo.read()).document.revision).toBe(1);
});
```

- [x] Chạy `pnpm --filter @webminton/backend test` đỏ. Implement S3 GetObject body parse/validate; PutObject `IfMatch`, seed `IfNoneMatch:'*'`; map errors spec §4. Handler bắt JSON malformed, body limit, unknown commands, thiếu precondition. Router không có catch-all write public.
- [x] Hoàn thiện CLI roster-config và command replaceRoster: validate refs, giữ nguyên dữ liệu ngoài roster, từ chối xóa người có trận/payment, khóa thay đổi thành viên sau draw confirmed; cho đổi tên giữ ID. Implement mỗi command file theo domain Tasks 1–6: field allowlist, validate trước mutation, derive, audit và idempotency cùng một write. Hash payload deterministic. JWT group lấy từ gateway claims, scope kiểm tại authorizer và server, không parse token không verify. Missing scope/group/client không được quyền admin.
- [x] Implement restore: đọc version, validate schema, giữ revision hiện tại+1 và ledger request/audit hiện tại, thêm restore event, tính lại; không CopyObject đè mù. Test restore đồng thời thất bại 409 và old invalid schema bị từ chối.
- [x] Viết local API adapter gọi router, test identity chỉ tồn tại local runner, không bypass env trong Lambda production. Chạy tests xanh.
- [x] Commit riêng cho task: `feat: expose protected tournament API with S3 concurrency`.

### Task 8: Next.js landing theo poster và shell tiếng Việt

**Files:** Create frontend package/config; `frontend/src/app/{layout.tsx,page.tsx,globals.css}`; `frontend/src/features/landing/{TournamentHero,RulesSection,SponsorSection}.tsx`; `frontend/src/lib/{api,format}.ts`; `frontend/public/posters/thong-bao-trang-{1,2,3}.jpg`; `tests/e2e/landing.spec.ts`.

**Interfaces:** `getPublicTournament(): Promise<PublicTournament>` với type infer từ projection schema; `formatVnd(number):string`; `formatDate(iso:string):string`; public API responses không chứa private document. App layout dùng shared nav sáu route trong spec.

- [x] Tạo E2E đọc tiêu đề, trạng thái ngày chưa chốt, navigation và không có contact placeholder `[Tên]`. Chạy trên export, kỳ vọng đỏ:

```ts
test('landing giữ thông tin chưa chốt và tiếng Việt', async ({page}) => {
  await page.goto('/');
  await expect(page.getByRole('heading',{name:/Giải cầu lông nội bộ 2026/i})).toBeVisible();
  await expect(page.getByText(/chưa chốt ngày/i)).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang','vi');
});
```

- [x] Scaffold App Router với export/trailingSlash; xây tokens theo spec §3. Dùng text thật từ JSON, không hardcode ngày/phí; ảnh poster có alt, width/height; không bắt buộc image optimizer server. Ngày/phí runtime đổi qua API không cần redeploy; metadata build-time chỉ dùng tên giải chung, không embed thông tin có thể đổi.
- [x] Tạo loading/error/retry/empty, navigation mobile bàn phím. QR chỉ render khi flag public đã xác nhận. Chạy `pnpm --filter @webminton/frontend build`, Playwright 390×844 và 1440×900; xem screenshots đối chiếu 3 poster, chỉnh clipping/contrast.
- [x] Commit riêng cho task: `feat: build Vietnamese poster-inspired landing`.

### Task 9: Đăng nhập BTC, danh sách VĐV và cấu hình giải

**Files:** Create `frontend/src/lib/auth.ts`, `frontend/src/features/admin/{AdminSession,SettingsForm,VersionHistory}.tsx`, `frontend/src/features/athletes/{AthleteTable}.tsx`; routes `/quan-tri/`, `/van-dong-vien/`; `tests/e2e/athletes-admin.spec.ts`.

**Interfaces:** API client `getAdminTournament()` và `sendCommand(command,etag)`; client giữ requestId qua retry. `AdminSession` dùng Cognito hosted login PKCE, static callback tại `/quan-tri/`, logout xóa private query data. Tất cả command forms có conflict UI giữ giá trị người dùng.

- [x] Test khách xem tên mà response không có phone; non-admin không lưu; CLI cập nhật roster JSON và sửa tên không đổi ID, trang danh sách phản ánh thay đổi; session hết hạn không mất draft:

```ts
test('khách không thấy thông tin liên hệ cá nhân', async ({request}) => {
  const r = await request.get('/api/public/tournament');
  const body = await r.json();
  expect(JSON.stringify(body)).not.toContain('phone');
  expect(JSON.stringify(body)).not.toContain('feePayments');
});
```

- [x] Chạy đỏ; implement bảng chỉ đọc từ JSON, tìm kiếm/lọc giới tính/đội; không có form thêm/sửa/import VĐV; phí là payment thực tế; cấu hình giữ null thay giá trị đoán. Seed UI chưa có admin phải có hướng dẫn vận hành, không tạo tài khoản công khai.
- [x] Implement versions/restore preview với reason; tích hợp CLI roster-config với API admin từ Task 7. Test conflict hai browser contexts và stale ETag. Chạy xanh.
- [x] Commit riêng cho task: `feat: add admin access and athlete management`.

### Task 10: Vòng quay tên và sơ đồ giải

**Files:** Create `frontend/src/features/draw/{DrawWheel,TeamPreview}.tsx`, `frontend/src/features/matches/{GroupSchedule,Standings,PlacementBracket,MatchEditor,CourtSchedule}.tsx`; `/boc-tham/page.tsx`, `/lich-thi-dau/page.tsx`; `tests/e2e/{draw,tournament-flow}.spec.ts`.

**Interfaces:** Gọi commands generateDraw/confirmDraw/resetDraw/setLineup/publishLineup/reorderMatches/setSchedule/setScore/setWalkover/resolveTie/resetPlacement. Query refresh sau success; polling 15s/focus, không polling khi tab ẩn.

- [ ] Viết E2E: bốc 24 người, reload giữ draft, confirm mỗi người một đội; reduced motion vẫn thấy kết quả. Flow đủ 18 scores → BXH → 6 placements → champion; chưa đủ 18 không có tên seed. Test màn hình edit score không cho 21–20.

```ts
test('refresh đường dẫn lịch vẫn mở đúng trang', async ({page}) => {
  await page.goto('/lich-thi-dau/');
  await page.reload();
  await expect(page.getByRole('heading',{name:'Lịch thi đấu'})).toBeVisible();
  await expect(page.getByRole('tab',{name:'Bảng xếp hạng'})).toBeVisible();
});
```

- [ ] Chạy đỏ; wheel diễn lại draft backend, disable double clicks, nút bỏ hoạt ảnh, aria-live kết quả. Hiển thị độ lệch các đội và cảnh báo thiếu dữ liệu trình độ.
- [ ] Render 18 cards/table, BXH đúng criteria; 2 placement encounters ×3 matches; tên theo pair ID, nháp kín hiện “Chưa công bố”. Admin dùng select VĐV, reorder có nút lên/xuống ngoài drag. Conflict score giữ form; downstream reset preview liệt kê trận ảnh hưởng, yêu cầu reason/confirm.
- [ ] Test public network payload không có lineup kín, interval conflict thông báo tiếng Việt, đại diện hai admins sửa. Chạy xanh.
- [ ] Commit riêng cho task: `feat: add draw and tournament control screens`.

### Task 11: Thu chi, tài trợ và vinh danh

**Files:** Create `frontend/src/features/finance/{FinanceDashboard,ExpenseEditor,SponsorEditor}.tsx`, `/thu-chi/page.tsx`, `frontend/src/features/matches/Awards.tsx`; `tests/e2e/finance.spec.ts`.

**Interfaces:** Commands upsertExpense/upsertSponsor/upsertIncome/recordFeePayment/publishFinance/finalizeTournament; totals chỉ từ server. Awards đọc results trên landing/bracket, không tự suy ra winner trên client.

- [ ] Test thực thu 1.000.000 BTC đã nhận + 500.000 tài trợ đã nhận − 300.000 chi đã trả = 1.200.000; unpaid expense chỉ vào dự toán. Khách trước publish thấy “Chưa công bố thu chi”, sau publish thấy summary không có phí cá nhân:

```ts
test('tài chính chưa công bố không lộ khoản thu chi', async ({request}) => {
  const t = await (await request.get('/api/public/tournament')).json();
  expect(t.finance).toEqual({published:false});
});
```

- [ ] Chạy đỏ; implement quantity/unit price, paid/received, sponsor tiers và overrides có lý do, tổng cam kết vs thực thu, góp thêm/người chỉ đề xuất. Payment retries cùng requestId không nhân đôi.
- [ ] Chạy xanh, xem tiền Việt trên mobile, kiểm tra 0 VĐV và đồng tài trợ.
- [ ] Commit riêng cho task: `feat: add transparent finance and tournament awards`.

### Task 12: Terraform AWS dev/prod và bootstrap

**Files:** Create `infra` files theo cây; `.tflint.hcl`, `.checkov.yaml` chỉ khi có cấu hình cần thiết; `docs/runbooks/bootstrap.md`; `backend/test/integration/s3.test.ts`.

**Interfaces:** Outputs `site_bucket_name`, `data_bucket_name`, `distribution_id`, `site_url`, `user_pool_id`, `user_pool_client_id`, `cognito_domain`, `lambda_function_name`; inputs `environment`, `region`, `name_prefix`, `github_repository`, optional `oidc_provider_arn`, `lambda_zip_path`, `lambda_zip_hash`. Deployment uses these exact names.

- [ ] Đối chiếu mẫu module frontend/api/compute/auth/data; viết check expectations trước: private buckets, no DDB, method auth separation, no global error fallback, API stage `/api`, no duplicate origin path. Terraform test/assert hoặc static policy kiểm các properties này, không test resource name vô nghĩa.
- [ ] Implement bootstrap state/versioning/OIDC trusts restricted repo/environment, S3 lockfile; module permissions spec §6. Rewrite function gắn duy nhất site behavior:

```js
function handler(event) {
  var request = event.request;
  if (request.uri.endsWith('/')) request.uri += 'index.html';
  else if (!request.uri.split('/').pop().includes('.')) request.uri += '/index.html';
  return request;
}
```

- [ ] REST public GET authorization NONE; admin resource methods Cognito + scope; API caching disabled, forward Authorization/If-Match, integration deployment hash gồm cấu hình methods/auth. Cognito client no secret, callback/logout đúng site URL. Bootstrap account inputs không hardcode account thật.
- [ ] Run `terraform fmt -check -recursive infra`, `terraform -chdir=infra/envs/dev init -backend=false`, `terraform -chdir=infra/envs/dev validate`, `tflint --chdir=infra/envs/dev`, `uvx checkov -d infra`; lặp env prod/bootstrap validation. Không suppress security findings chung; lý do exception phải cụ thể.
- [ ] Khi Huy duyệt triển khai và cung cấp account: plan dev, review, apply; seed bằng create-only; chạy AWS integration CAS hai writer thật và restore version. Kiểm tra S3 public access bị chặn.
- [ ] Commit riêng cho task: `infra: provision serverless tournament stack`.

### Task 13: Quality workflows và kiểm tra PR

**Files:** Create `.github/workflows/quality.yml`, `.github/workflows/plan.yml`; `playwright.config.ts`; root scripts cho `test:e2e`; `docs/runbooks/operations.md` phần quality.

**Interfaces:** `quality.yml` supports `pull_request`, `push: main`, `workflow_call`; required job name `quality`; no AWS permission by default. `plan.yml` manual protected ref only, role repo/env scoped.

- [ ] Viết quality jobs install frozen → lint/typecheck/unit → backend build/frontend export → E2E qua local API và static server. Artifact test reports chỉ khi thất bại, không chứa token/PII. Pin actions SHA được kiểm tra từ release chính thức lúc triển khai, Dependabot updates.
- [ ] Chạy commands giống CI tại local; tạo failure cố ý trên nhánh thử để xác nhận required gate chặn merge/deploy, rồi bỏ thay đổi thử. Fork scenario không chạy OIDC. `actionlint` xác nhận YAML/expressions.
- [ ] Manual plan build Lambda trước terraform plan, assume read role chỉ protected ref, không viết comment/token vào PR; quyền state lock giới hạn lock key. Không upload plan chứa sensitive data vào artifact công khai.
- [ ] Commit riêng cho task: `ci: enforce application and infrastructure quality gates`.

### Task 14: Deployment cùng SHA và rollback

**Files:** Create `.github/workflows/deploy.yml`, `scripts/smoke-deployment.ts`, `docs/runbooks/rollback.md`; update bootstrap outputs nếu cần ARN roles.

**Interfaces:** deployment requires reusable `quality` workflow success on same SHA, protected `dev`/`prod` environment, OIDC role, outputs Task 12; smoke accepts `SITE_URL`. GitHub vars `AWS_REGION`, `STATE_BUCKET_NAME`, `AWS_DEPLOY_ROLE_ARN`, `NAME_PREFIX`, `GITHUB_REPOSITORY`; environment tfvars xác định environment, không secrets trong frontend.

- [ ] Implement jobs dependencies và serialization:

```yaml
permissions:
  contents: read
concurrency:
  group: deploy-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: false
jobs:
  quality:
    uses: ./.github/workflows/quality.yml
  deploy:
    needs: quality
    environment: prod
    permissions:
      contents: read
      id-token: write
    runs-on: ubuntu-latest
    # Job body follows the ordered release steps below.
```

- [ ] Bổ sung steps thực theo thứ tự: checkout exact SHA, frozen install, build backend ZIP, OIDC, remote init, `terraform plan -out=release.tfplan`, `terraform apply release.tfplan`, outputs, frontend build, lưu release manifest/hash/artifacts, upload immutable chunks trước HTML, invalidate HTML, smoke. Không chạy seed thường kỳ, không cấp quyền data write cho site upload role. Dùng GitHub concurrency group theo environment nếu workflow mở rộng cả dev/prod.
- [ ] Smoke GET `/`, các route trailing slash, GET public JSON, unauthorized POST trả 401/403 JSON (không 200 HTML), missing API giữ error status. Authenticated smoke dùng danh tính test staging riêng, không bypass auth prod.
- [ ] Diễn tập deploy fail ở quality không chạm AWS; deploy lỗi smoke đánh dấu failed. Rollback chọn artifact SHA trước, deploy backend/schema tương thích rồi site, kiểm revision/ETag data không đổi.
- [ ] Commit riêng cho task: `ci: deploy verified releases and document rollback`.

### Task 15: Diễn tập giải và bàn giao

**Files:** Create `docs/acceptance/2026-tournament-checklist.md`, `README.md`; complete `docs/runbooks/{bootstrap,operations,rollback}.md`; `tests/e2e/full-tournament.spec.ts`.

- [ ] Xác nhận thông tin vận hành còn thiếu trong spec §7; sáu quyết định sản phẩm đã chốt, không yêu cầu xác nhận lại. Giữ ba nội dung mặc định cho tới khi BTC quyết định thay đổi dựa trên đăng ký thực tế.
- [ ] Chạy một giải giả trên dev với 24 VĐV; bốc thăm, lịch nhiều sân, nhập 18+6 kết quả, tiebreak, sửa điểm bị khóa, reset có lý do, giải thưởng; đối chiếu domain expectations với thể lệ viết, không đối chiếu công thức Excel lỗi.
- [ ] Chạy hai admin cùng ghi; timeout/retry payment; mất mạng/reload wheel; refresh tất cả static routes; Cognito expired/non-admin; verify private fields không lọt HTML/JSON/static artifacts. Thử missing/corrupt S3 document trả lỗi vận hành, không reset về seed.
- [ ] Diễn tập version restore CAS trên dev; rollback code không rollback data. Kiểm logs không PII và alarms có đường nhận. Chạy `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:e2e`, các IaC checks Task 12 và actionlint.
- [ ] Review visual tại 390px/1440px, keyboard, reduced motion, focus, bảng lịch cuộn được; ghi evidence screenshot và test report. README ghi local setup, seed an toàn, đăng nhập, sửa roster JSON thủ công, luật, deploy, restore, hạn chế S3 JSON và commands.
- [ ] Commit riêng cho task: `docs: document verified tournament operations`; báo rõ test thực sự chạy và quyết định chưa chốt. Production release chỉ sau khi Huy duyệt deployment cụ thể.

## Ma trận bao phủ

| Yêu cầu | Task |
|---|---|
| Backend recommendation + mẫu AWS | Spec §2, 7, 12 |
| S3 JSON toàn bộ cấu hình/kết quả | 1, 7, 12 |
| Landing theo poster, tiếng Việt | 8, 15 |
| Danh sách VĐV/Excel | 1, 6, 9 |
| Random lập đội/wheel | 4, 10 |
| Lịch/bracket đủ 24 trận | 2, 3, 5, 10 |
| Admin đổi thứ tự/tên/cặp/điểm | 5, 7, 9, 10 |
| Advance tự động đúng luật | 2, 3, 10 |
| Thu chi, tài trợ, champion/runner-up | 3, 6, 11 |
| Terraform, CI quality/deploy | 12, 13, 14 |
| Concurrency, quyền, restore | 7, 9, 12, 15 |

## Handoff

Đang thực thi bằng executing-plans trên nhánh feat/webminton-implementation. Xem docs/implementation-progress.md để biết task và kiểm tra đã hoàn thành. Các test/code blocks ở kế hoạch là hướng dẫn khởi đầu, không thay thế việc đọc toàn bộ hợp đồng schema và viết đủ behavior tests của task.
