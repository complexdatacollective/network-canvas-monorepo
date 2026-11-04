import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { transformAsync } from '@babel/core';
import { act, renderHook } from '@testing-library/react';
import reactCompiler from 'babel-plugin-react-compiler';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { useDecryptionScope as UseDecryptionScope } from '../useDecryptionScope';
import { createEncryptionStore, unlockWith } from './encryptionFixtures';

// Fresco compiles this package with the React Compiler, which reuses a hook's
// result until one of its inputs changes. The suite's own transform does not
// run the compiler, so the hook is compiled here as Fresco compiles it.
const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(here, '../useDecryptionScope.ts');
// Outside node_modules, which the runner would load without transforming, and
// inside the repository's ignored `src/__tests__/.cache`.
const outputDir = resolve(here, '../../../__tests__/.cache/compiled-hooks');
const outputPath = join(outputDir, 'useDecryptionScope.mjs');

let useCompiledDecryptionScope: typeof UseDecryptionScope;

beforeAll(async () => {
  const source = stripTypeScriptTypes(await readFile(sourcePath, 'utf8'));
  const compiled = await transformAsync(source, {
    filename: sourcePath,
    babelrc: false,
    configFile: false,
    plugins: [[reactCompiler, { target: '19', panicThreshold: 'all_errors' }]],
  });
  if (!compiled?.code?.includes('react/compiler-runtime')) {
    throw new Error('The React Compiler did not compile useDecryptionScope');
  }
  // Relative imports point back at the source, so the compiled hook shares
  // its modules (and the key registry) with this test.
  const code = compiled.code.replace(
    /from (['"])(\.{1,2}\/[^'"]+)\1/g,
    (_match: string, quote: string, specifier: string) =>
      `from ${quote}${resolve(dirname(sourcePath), specifier)}${quote}`,
  );
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, code);
  ({ useDecryptionScope: useCompiledDecryptionScope } = (await import(
    /* @vite-ignore */ outputPath
  )) as { useDecryptionScope: typeof UseDecryptionScope });
});

afterAll(async () => {
  await rm(outputPath, { force: true });
});

describe('useDecryptionScope compiled by the React Compiler', () => {
  it('returns the scope once the passphrase is entered after the first render', async () => {
    const store = createEncryptionStore([]);
    const { result } = renderHook(() => useCompiledDecryptionScope(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <Provider store={store}>{children}</Provider>
      ),
    });
    expect(result.current).toBeUndefined();

    await act(() => unlockWith(store, 'passphrase'));

    expect(result.current).toBeDefined();
    expect(result.current?.id).toBe(store.getState().ui.encryptionKeyId);
  });
});
