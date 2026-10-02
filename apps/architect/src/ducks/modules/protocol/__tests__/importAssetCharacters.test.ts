import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import appReducer from '~/ducks/modules/app';

import reducer, { importAssetAsync } from '../assetManifest';

// Only the durable write is replaced: the file is validated by the real
// readers, so these tests fail if the import stops running the check.
vi.mock('~/utils/assetUtils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/utils/assetUtils')>()),
  saveAssetWithFallback: vi.fn(() => Promise.resolve({ persisted: true })),
}));

const { saveAssetWithFallback } = await import('~/utils/assetUtils');
const mockedSaveAssetWithFallback = vi.mocked(saveAssetWithFallback);

const BELL = String.fromCharCode(0x7);
const UNIT_SEPARATOR = String.fromCharCode(0x1f);

const createTestStore = () =>
  configureStore({
    reducer: { app: appReducer, assetManifest: reducer },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ serializableCheck: false }),
  });

describe('importing a roster that holds a character exports cannot carry', () => {
  let store: ReturnType<typeof createTestStore>;

  const importFile = (contents: string, name: string) =>
    store.dispatch(importAssetAsync({ file: new File([contents], name) }));

  beforeEach(() => {
    store = createTestStore();
    vi.clearAllMocks();
  });

  it('refuses a CSV roster and names the row and column', async () => {
    const result = await importFile(
      `name,notes\nAlice,ok\nBob,b${BELL}d\n`,
      'roster.csv',
    );

    expect(result.type).toBe('assetManifest/importAssetAsync/rejected');
    expect(result.payload).toMatchObject({
      filename: 'roster.csv',
      code: 'UNSUPPORTED_CHARACTERS',
      message:
        'Row 3 of the “notes” column contains a character that can’t be used (U+0007). Delete it from the file, then import the file again.',
    });
    expect(mockedSaveAssetWithFallback).not.toHaveBeenCalled();
    expect(store.getState().assetManifest).toEqual({});
  });

  it('says how many other places have the same problem', async () => {
    const result = await importFile(
      `name,notes\nA${BELL},x\nB,y${BELL}\nC,z${BELL}\n`,
      'roster.csv',
    );

    expect(result.payload).toMatchObject({
      message:
        'Row 2 of the “name” column contains a character that can’t be used (U+0007). Delete it from the file, then import the file again. The same problem appears in 2 other places in the file.',
    });
  });

  it('names the column whose header holds the character', async () => {
    const result = await importFile(
      `name,no${UNIT_SEPARATOR}tes\nAlice,x\n`,
      'roster.csv',
    );

    expect(result.payload).toMatchObject({
      message:
        'The header of column 2 contains a character that can’t be used (U+001F). Delete it from the file, then import the file again.',
    });
  });

  it('refuses a JSON roster and names the node and attribute', async () => {
    const result = await importFile(
      JSON.stringify({
        nodes: [
          { attributes: { name: 'Alice' } },
          { attributes: { name: 'Bob', notes: `b${BELL}d` } },
        ],
        edges: [],
      }),
      'roster.json',
    );

    expect(result.payload).toMatchObject({
      code: 'UNSUPPORTED_CHARACTERS',
      message:
        'The “notes” attribute of node 2 contains a character that can’t be used (U+0007). Delete it from the file, then import the file again.',
    });
    expect(mockedSaveAssetWithFallback).not.toHaveBeenCalled();
  });

  it('names the line of a JSON file the character stops parsing', async () => {
    const result = await importFile(
      `{"nodes": [\n{"attributes": {"name": "b${BELL}d"}}\n], "edges": []}`,
      'roster.json',
    );

    expect(result.payload).toMatchObject({
      message:
        'Line 2 of this file contains a character that can’t be used (U+0007). Delete it from the file, then import the file again.',
    });
  });

  it('accepts tabs and line breaks inside quoted cells', async () => {
    const result = await importFile(
      'name,notes\r\nAlice,"one\ttwo"\r\nBob,"line one\r\nline two"\r\n',
      'roster.csv',
    );

    expect(result.type).toBe('assetManifest/importAssetAsync/fulfilled');
    expect(Object.values(store.getState().assetManifest)).toHaveLength(1);
  });
});
