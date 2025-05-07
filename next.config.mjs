/** @type {import('next').NextConfig} */
const nextConfig = {
    // skip ESLint errors during production builds
    eslint: {
      ignoreDuringBuilds: true,
    },
    // (optional) skip TypeScript errors during builds
    typescript: {
      ignoreBuildErrors: true,
    },
  };
  
  export default nextConfig;
  
