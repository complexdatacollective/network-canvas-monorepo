import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { CATEGORICAL_BIN_MAX_BINS } from '@codaco/protocol-validation';

const require = createRequire(import.meta.url);
const interviewCss = readFileSync(
  join(
    require.resolve('@codaco/tailwind-config/fresco.css'),
    '../themes/interview.css',
  ),
  'utf8',
);

const counts = Array.from(
  { length: CATEGORICAL_BIN_MAX_BINS },
  (_, index) => index + 1,
);

describe('CategoricalBin bin limit', () => {
  it('lays out every bin count the schema allows, and no more', () => {
    for (const count of counts) {
      expect(interviewCss).toContain(`.catbin-grid[data-count='${count}']`);
    }
    expect(interviewCss).not.toContain(
      `.catbin-grid[data-count='${CATEGORICAL_BIN_MAX_BINS + 1}']`,
    );
  });

  it('defines a category color for every bin the schema allows', () => {
    for (const count of counts) {
      expect(interviewCss).toMatch(new RegExp(`--cat-${count}:`));
    }
  });
});
