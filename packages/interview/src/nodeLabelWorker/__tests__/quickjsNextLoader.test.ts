import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import quickjsNextLoader from '../quickjsNextLoader';

describe('quickjsNextLoader', () => {
  it('rewrites the installed QuickJS module so nothing is left for a bundler to resolve', () => {
    const source = readFileSync(
      fileURLToPath(
        import.meta.resolve('@jitl/quickjs-asmjs-mjs-release-sync'),
      ),
      'utf8',
    );

    const rewritten = quickjsNextLoader(source);

    expect(rewritten).not.toContain('import("module")');
    expect(rewritten).not.toContain('new URL("./"');
    expect(rewritten.length).toBeGreaterThan(source.length - 100);
  });

  it('refuses a module it does not recognise', () => {
    expect(() => quickjsNextLoader('export default {}')).toThrow(
      /needs updating/,
    );
  });
});
