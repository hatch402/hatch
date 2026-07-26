/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

export default {
  output: "export",
  // Dev and production must not share a build cache: running `next build`
  // while `next dev` is up would otherwise overwrite the dev server's assets
  // and every chunk starts 404ing.
  distDir: isProd ? ".next-build" : ".next-dev",
  images: { unoptimized: true },
  trailingSlash: true,
};
