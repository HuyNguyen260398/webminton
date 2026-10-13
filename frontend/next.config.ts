import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

// `next dev` has no API of its own. `pnpm dev` starts scripts/serve-static.ts
// beside it, and these rewrites hand it /api/* and the published snapshot, so
// /quan-tri works on :3000 with the "Đăng nhập thử" button. Development only:
// a static export cannot carry rewrites, and the deployed site needs none.
// So the dev server is not told about the export — Next warns about the pair
// otherwise — and `pnpm build` is what checks the pages can be exported.
const LOCAL_API = `http://127.0.0.1:${process.env.LOCAL_API_PORT ?? 3100}`;

export default (phase: string): NextConfig =>
  phase === PHASE_DEVELOPMENT_SERVER
    ? {
        ...config,
        output: undefined,
        skipTrailingSlashRedirect: true,
        rewrites: async () => ({
          beforeFiles: [
            { source: "/api/:path*", destination: `${LOCAL_API}/api/:path*` },
            {
              source: "/tournament.json",
              destination: `${LOCAL_API}/tournament.json`,
            },
          ],
          afterFiles: [],
          fallback: [],
        }),
      }
    : config;
