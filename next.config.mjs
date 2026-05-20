/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // EdgeOne Pages supports Next.js standalone or static export.
  // For SSR + API routes (which this project needs), deploy as a Node.js project.
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};

export default nextConfig;
