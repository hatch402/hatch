/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";

export default {
  // Not a static export: /v1 needs to run per request to verify a payment
  // on-chain. The pages are still prerendered.
  distDir: isProd ? ".next-build" : ".next-dev",
  images: { unoptimized: true },
};
