// `next dev` serves no backend, so /api/* would 404 and every page would render
// empty. In development only, proxy it to scripts/serve-local-api.ts. A static
// export ignores rewrites, so this must never be added to a production build.
const devProxy =
  process.env.NODE_ENV === "development"
    ? {
        async rewrites() {
          const origin = process.env.LOCAL_API_ORIGIN ?? "http://127.0.0.1:3001";
          return [{ source: "/api/:path*", destination: `${origin}/api/:path*` }];
        },
      }
    : {};

export default {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  ...devProxy,
};
