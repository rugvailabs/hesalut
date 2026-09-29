/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      // Explore is the front door. Temporary (307), not permanent: browsers
      // cache a 308 indefinitely, which would make this hard to undo.
      // The old homepage (app/page.tsx) is kept but no longer reachable.
      { source: "/", destination: "/explore", permanent: false },
    ];
  },
};

export default nextConfig;
