import { describe, expect, it } from 'vitest';

import { sharedRendererConfig } from '../../vite.renderer.shared.js';

// Vite skips dynamic-import transformation for anything the exclude patterns
// match. protocol-validation loads its validators with
// import(`./schemas/${version}.js`); if Vite skips the package, the import is
// left pointing at the bundle and every protocol import fails validation.
const isExcluded = (id) =>
  sharedRendererConfig.build.dynamicImportVarsOptions.exclude.some((pattern) =>
    pattern.test(id),
  );

describe('renderer build config', () => {
  it('transforms protocol-validation’s dynamic schema import', () => {
    expect(
      isExcluded(
        '/repo/node_modules/.pnpm/@codaco+protocol-validation@3.0.0/node_modules/@codaco/protocol-validation/dist/index.js',
      ),
    ).toBe(false);
  });

  it('keeps skipping other dependencies, like Vite does by default', () => {
    expect(
      isExcluded(
        '/repo/node_modules/.pnpm/react-dom@16.14.0/node_modules/react-dom/index.js',
      ),
    ).toBe(true);
    expect(isExcluded('/repo/node_modules/lodash/lodash.js')).toBe(true);
  });

  it('transforms app source', () => {
    expect(isExcluded('/repo/apps/interviewer-classic/src/index.js')).toBe(
      false,
    );
  });
});
