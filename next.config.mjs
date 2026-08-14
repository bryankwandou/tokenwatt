/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // Usage data is read from disk at build time, so pages can be fully static.
  outputFileTracingIncludes: {
    '/': ['./data/**/*'],
  },
};
