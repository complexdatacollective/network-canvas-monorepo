import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { PROTOCOL_REVIEW_SERVICE_URL } from '@codaco/protocol-review-worker/contract';

// The policy is a literal in the Vite config (Node loads that file, which
// cannot import the contract), so this keeps the two in step.
const viteConfig = readFileSync('vite.config.ts', 'utf8');

describe('content security policy', () => {
  it('lets the app reach the protocol review service', () => {
    const connectSrc = /"connect-src ([^"]+)"/u.exec(viteConfig)?.[1];
    expect(connectSrc?.split(' ')).toContain(
      new URL(PROTOCOL_REVIEW_SERVICE_URL).origin,
    );
  });
});
