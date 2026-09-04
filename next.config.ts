import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // This project documents itself in README.md; the generated agent files are
  // noise in the diff.
  agentRules: false,
};

export default nextConfig;
