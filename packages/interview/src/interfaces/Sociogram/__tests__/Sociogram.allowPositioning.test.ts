import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// Regression guard for #673 (decision #12): `layout.allowPositioning` is
// vestigial — the schema-8 `layout` is a strictObject carrying only
// `layoutVariable`, so the key is unexpressible and the interview's
// disable-repositioning path was dead code. Node positioning is the only
// behaviour the schema supports, so it must stay unconditionally enabled.
const sociogramSource = readFileSync(
  resolve(__dirname, '../Sociogram.tsx'),
  'utf8',
);

describe('Sociogram layout.allowPositioning removal', () => {
  it('no longer reads layout.allowPositioning from the prompt', () => {
    expect(sociogramSource).not.toContain('allowPositioning');
  });

  it('does not override the Canvas allowRepositioning default', () => {
    // Passing allowRepositioning would reintroduce a way to disable
    // positioning; the Canvas default (true) must own the behaviour.
    expect(sociogramSource).not.toContain('allowRepositioning');
  });
});
