import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// Read rather than imported: Vite hands a `.css` import to its CSS pipeline,
// which is not what this asserts about. Vitest runs from the package root.
const stylesheet = readFileSync('src/styles.css', 'utf8');

describe('the package stylesheet', () => {
  /**
   * A host's Tailwind build does not scan inside a workspace package on its
   * own, so every package that ships components points the scanner at itself.
   * Without this the host gets the stage editor's markup but not its layout,
   * and nothing fails loudly — the outline and the form simply render in
   * the narrow single-column arrangement at every width.
   */
  it('points the class scanner at this package', () => {
    expect(stylesheet).toContain("@source './**/*.{js,ts,tsx}';");
  });
});
