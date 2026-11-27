import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// Regression guard for #673 (decision #12): `layout.allowPositioning` is
// vestigial, so the Sociogram must never read it. Whether nodes can be moved
// follows from the prompt's task alone: they move in a layout task and in no
// other. `Sociogram.tasks.test.tsx` shows the behaviour; this guards that no
// second setting can decide it.
const sociogramSource = readFileSync(
  resolve(__dirname, '../Sociogram.tsx'),
  'utf8',
);

describe('Sociogram repositioning', () => {
  it('never reads layout.allowPositioning', () => {
    expect(sociogramSource).not.toContain('allowPositioning');
  });

  it('derives repositioning from the task alone', () => {
    const passed = [
      ...sociogramSource.matchAll(/allowRepositioning=\{([^}]*)\}/g),
    ].map(([, value]) => value);
    expect(passed).toEqual(['isLayoutTask']);
    expect(sociogramSource).toContain(
      "const isLayoutTask = prompt.task === 'layout';",
    );
  });
});
