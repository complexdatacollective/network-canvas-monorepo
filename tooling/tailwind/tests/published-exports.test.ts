import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

type Manifest = {
  exports: Record<string, string>;
  publishConfig: { exports: Record<string, string> };
};

const manifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as Manifest;

// The TypeScript exports (`theme-colors`, `elevation`, `type-scale`) are for
// build tools in this repository. Node refuses to strip types from a file
// under node_modules, so from an npm install they would not load; pnpm
// publishes `publishConfig.exports` in their place, which leaves them out.
describe('the published exports', () => {
  it('are the workspace exports less the TypeScript ones', () => {
    const published = Object.fromEntries(
      Object.entries(manifest.exports).filter(
        ([, target]) => !target.endsWith('.ts'),
      ),
    );
    expect(manifest.publishConfig.exports).toEqual(published);
  });
});
