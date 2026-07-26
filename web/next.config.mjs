/** @type {import('next').NextConfig} */

// Vercel's Next.js builder looks for .next and nothing else, so the custom
// output directory is a local-only convenience: it stops `next build` from
// overwriting a running dev server's assets. Setting it on Vercel makes the
// build "succeed" and then fail to find any output.
const local = !process.env.VERCEL;
const isProd = process.env.NODE_ENV === "production";

export default {
  ...(local ? { distDir: isProd ? ".next-build" : ".next-dev" } : {}),
  images: { unoptimized: true },
};
