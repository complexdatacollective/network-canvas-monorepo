import { describe, expect, it } from 'vitest';

import type { RootState } from '~/ducks/modules/root';
import {
  getAssetManifest,
  getDisplayAssetManifest,
} from '~/selectors/protocol';

const asset = (name: string) => ({
  type: 'network' as const,
  name,
  source: name,
});

const stateWith = (assetManifest: Record<string, unknown>): RootState =>
  ({
    activeProtocol: {
      present: {
        name: 'Study',
        schemaVersion: 8,
        stages: [],
        codebook: { node: {}, edge: {}, ego: {} },
        assetManifest,
      },
    },
    stageEditorDraft: { ui: { liveValues: null } },
  }) as unknown as RootState;

describe('getDisplayAssetManifest', () => {
  it('gives two resources that share a filename different names', () => {
    const state = stateWith({
      'asset-1': asset('people.csv'),
      'asset-2': asset('people.csv'),
    });

    const manifest = getDisplayAssetManifest(state);

    expect(manifest['asset-1']?.name).toBe('people.csv');
    expect(manifest['asset-2']?.name).toBe('people (2).csv');
  });

  it('never rewrites the stored manifest', () => {
    // The protocol on disk keeps the names the researcher gave their files.
    // This is the guard against the display name leaking into what is saved,
    // exported, or read by Interviewer and Fresco.
    const state = stateWith({
      'asset-1': asset('people.csv'),
      'asset-2': asset('people.csv'),
    });

    getDisplayAssetManifest(state);

    expect(
      Object.values(getAssetManifest(state)).map((entry) => entry.name),
    ).toEqual(['people.csv', 'people.csv']);
  });

  it('leaves `source` pointing at the researcher’s own file', () => {
    const state = stateWith({
      'asset-1': asset('people.csv'),
      'asset-2': asset('people.csv'),
    });

    const entry = getDisplayAssetManifest(state)['asset-2'];

    expect(entry).toMatchObject({
      name: 'people (2).csv',
      source: 'people.csv',
    });
  });

  it('passes an uncontested manifest through by reference', () => {
    // Every protocol we ship is this case; nothing downstream should lose its
    // memoisation, or re-render, because this selector exists.
    const state = stateWith({
      'asset-1': asset('people.csv'),
      'asset-2': asset('places.csv'),
    });

    const stored = getAssetManifest(state);
    const displayed = getDisplayAssetManifest(state);

    expect(displayed['asset-1']).toBe(stored['asset-1']);
    expect(displayed['asset-2']).toBe(stored['asset-2']);
  });

  it('returns the same object while the manifest is unchanged', () => {
    const state = stateWith({ 'asset-1': asset('people.csv') });

    expect(getDisplayAssetManifest(state)).toBe(getDisplayAssetManifest(state));
  });
});
