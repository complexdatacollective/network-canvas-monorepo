import { join } from 'node:path';

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'export',
  // Pin the workspace root: in a git worktree Next otherwise detects the parent
  // checkout's pnpm-workspace.yaml and infers the wrong root.
  turbopack: { root: join(import.meta.dirname, '..', '..') },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
