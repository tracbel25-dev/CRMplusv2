import type { NextConfig } from 'next';

const landingR2Base = process.env.NEXT_PUBLIC_LANDING_R2_BASE_URL?.trim();

const landingR2Pattern = (() => {
  if (!landingR2Base) return null;
  try {
    const url = new URL(landingR2Base);
    if (url.protocol !== 'https:') return null;
    const pathname = `${url.pathname.replace(/\/$/, '') || ''}/**`;
    return {
      protocol: 'https' as const,
      hostname: url.hostname,
      port: url.port,
      pathname,
    };
  } catch {
    return null;
  }
})();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(landingR2Pattern ? { images: { remotePatterns: [landingR2Pattern] } } : {}),
};

export default nextConfig;
