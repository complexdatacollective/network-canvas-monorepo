import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import appReducer from '~/ducks/modules/app';

import reducer, { importAssetAsync } from '../assetManifest';

// Only the durable write is replaced, so the file goes through the real
// readers and the real heading rule.
vi.mock('~/utils/assetUtils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/assetUtils')>()),
  saveAssetWithFallback: vi.fn(() => Promise.resolve({ persisted: true })),
}));

const COMBINING_ACUTE = String.fromCharCode(0x301);

const createTestStore = () =>
  configureStore({
    reducer: { app: appReducer, assetManifest: reducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

describe('importing a roster: headings and rows', () => {
  let store: ReturnType<typeof createTestStore>;

  const importCsv = (contents: string) =>
    store.dispatch(
      importAssetAsync({ file: new File([contents], 'roster.csv') }),
    );

  beforeEach(() => {
    store = createTestStore();
    vi.clearAllMocks();
  });

  it('refuses a heading with a space at the end', async () => {
    const result = await importCsv('name,"notes "\nAda,x\n');

    expect(result.type).toBe('assetManifest/importAssetAsync/rejected');
    expect(result.payload).toMatchObject({ code: 'VARIABLE_NAME' });
  });

  it('refuses a JSON attribute name with a space at the start', async () => {
    const result = await store.dispatch(
      importAssetAsync({
        file: new File(
          [JSON.stringify({ nodes: [{ attributes: { ' notes': 'x' } }] })],
          'roster.json',
        ),
      }),
    );

    expect(result.payload).toMatchObject({ code: 'VARIABLE_NAME' });
  });

  it('accepts a heading spelled with a decomposed accent', async () => {
    const result = await importCsv(`Cafe${COMBINING_ACUTE}\nespresso\n`);

    expect(result.type).toBe('assetManifest/importAssetAsync/fulfilled');
  });

  it('accepts headings named after Object.prototype members, and compares their rows by value', async () => {
    const result = await importCsv(
      '__proto__,constructor,toString\na,b,c\na,b,d\n',
    );

    expect(result.type).toBe('assetManifest/importAssetAsync/fulfilled');
    expect(result.payload).toMatchObject({ duplicateCount: 0 });
  });

  it('accepts blank lines between rows, which the interview skips', async () => {
    const result = await importCsv('name,age\nAda,36\n\nGrace,45\n\n');

    expect(result.type).toBe('assetManifest/importAssetAsync/fulfilled');
  });

  it('refuses a row with a cell too many', async () => {
    const result = await importCsv('name,age\nAda,36,unexpected\n');

    expect(result.payload).toMatchObject({ code: 'COLUMN_MISMATCHED' });
  });

  it('refuses a row with a cell too few', async () => {
    const result = await importCsv('name,age\nAda\n');

    expect(result.payload).toMatchObject({ code: 'COLUMN_MISMATCHED' });
  });
});
