import { join } from 'node:path';

import type { NextConfig } from 'next';
import createNextIntl from 'next-intl/plugin';

const withNextIntl = createNextIntl('./lib/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin the workspace root: in a git worktree Next otherwise detects the parent
  // checkout's pnpm-workspace.yaml and infers the wrong root.
  turbopack: { root: join(import.meta.dirname, '..', '..') },
  images: {
    unoptimized: true,
  },
};

export default withNextIntl(nextConfig);
