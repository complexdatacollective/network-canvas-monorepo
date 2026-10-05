import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// Vitest runs from the app root.
const entry = readFileSync('src/styles/tailwind.css', 'utf8');

describe('the Tailwind entrypoint', () => {
  /**
   * Every workspace package Architect renders has to be named here. Tailwind
   * does not look inside one on its own, and each package points the scanner
   * at itself through its own `styles.css` — so a package whose glue is not
   * imported contributes its components without their utilities.
   *
   * Nothing fails loudly when that happens: the markup is correct and only the
   * layout is missing, which is how a stage name that used to wrap within its
   * column goes back to widening the hero instead.
   */
  it.each([
    '@codaco/fresco-ui/styles.css',
    '@codaco/protocol-builder/styles.css',
  ])('pulls in the class scanner for %s', (stylesheet) => {
    expect(entry).toContain(`@import '${stylesheet}';`);
  });
});
