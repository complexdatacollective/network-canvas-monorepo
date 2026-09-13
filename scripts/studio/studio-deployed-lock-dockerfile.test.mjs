import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { test } from 'vitest';

for (const [image, dockerfile, packageName, importer] of [
  [
    'Studio',
    'apps/studio/Dockerfile',
    '@codaco/studio-server',
    'apps/studio/server',
  ],
  [
    'Template Registry',
    'apps/template-registry/Dockerfile',
    '@codaco/template-registry',
    'apps/template-registry',
  ],
])
  test(`${image} verifies the installed production graph immediately after deployment`, () => {
    const source = readFileSync(dockerfile, 'utf8');
    assert.match(
      source,
      /COPY --from=pruner \/repo\/scripts\/verify-deployed-lock\.mjs \.\/scripts\/verify-deployed-lock\.mjs/,
    );
    assert.ok(
      source.includes(
        `RUN pnpm --filter ${packageName} deploy --prod --legacy /deploy
# The final image copies only /deploy. Hide source-workspace link targets so
# verification observes the same intentionally broken bundled-workspace links.
RUN --mount=type=tmpfs,target=/repo/apps --mount=type=tmpfs,target=/repo/packages \\
  node scripts/verify-deployed-lock.mjs pnpm-lock.yaml /deploy ${importer} /deploy/deployed-lock.json`,
      ),
    );
  });
